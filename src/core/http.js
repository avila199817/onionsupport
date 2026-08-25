/* =========================================================
   Onion Support - Core HTTP
   Archivo: /src/core/http.js

   Responsabilidad:
   - Cliente HTTP único de la SPA.
   - API base desde core/config.js.
   - credentials: "include" por defecto.
   - Authorization sólo si corresponde y existe access token en Core.
   - Leer/escribir sesión por el puerto runtime zero-copy de Core.
   - Parsear JSON/text/blob/arrayBuffer.
   - Descargar blobs/documentos.
   - Clasificar errores auth sin navegar.
   - Refresh automático single-flight ante access token expirado.
   - Retry único de la request original tras refresh OK.
   - Timeout + AbortSignal externo sin carreras.
   - Soporte PDF/blob 1:1 contra backend.
   - Sin Router.
   - Sin Toast.
   - Sin Store.
   - Sin Services.
   - Sin storage.
========================================================= */

import {
  config,
  AUTH_ENDPOINTS as CONFIG_AUTH_ENDPOINTS,
  SENSITIVE_QUERY_PARAMS,
  getApiBase,
  endpointPathFromUrlLike,
  normalizeEndpointPath,
  isPublicApiPath as configIsPublicApiPath,
  isPrivateApiPath as configIsPrivateApiPath,
} from "./config.js";

export const HTTP_VERSION =
  "core.http.refresh.blob.v9-runtime-state-port";

export const AUTH_ENDPOINTS =
  CONFIG_AUTH_ENDPOINTS;

const DEFAULT_TIMEOUT_MS =
  Number(
    config?.api?.timeout ||
    30000
  ) ||
  30000;

const DEFAULT_API_BASE =
  getApiBase();

const BODYLESS_METHODS =
  new Set([
    "GET",
    "HEAD",
  ]);

const VALID_METHODS =
  new Set([
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
  ]);

const BINARY_RESPONSE_TYPES =
  new Set([
    "blob",
    "arraybuffer",
    "array-buffer",
  ]);

const LEGACY_RESET_TOKEN_PATH =
  /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isPlainObject(value) {
  if (!isObject(value)) {
    return false;
  }

  try {
    const proto =
      Object.getPrototypeOf(
        value
      );

    return (
      proto === Object.prototype ||
      proto === null
    );
  } catch {
    return false;
  }
}

function isFunction(value) {
  return (
    typeof value === "function"
  );
}

function isBlob(value) {
  return (
    typeof Blob !== "undefined" &&
    value instanceof Blob
  );
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    output ||
    fallback
  );
}

function normalizeKey(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .replace(
      /[-_\s]/g,
      ""
    )
    .toLowerCase();
}

function normalizeCode(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .replace(
      /[\s-]+/g,
      "_"
    )
    .toUpperCase();
}

function first(...values) {
  for (
    const value
    of values
  ) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value ===
        "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function nowIso() {
  return (
    new Date()
      .toISOString()
  );
}

/* =========================================================
   SECURITY / REDACTION
========================================================= */

const SENSITIVE_KEYS =
  new Set(
    (
      Array.isArray(
        SENSITIVE_QUERY_PARAMS
      )
        ? SENSITIVE_QUERY_PARAMS
        : []
    )
      .map(normalizeKey)
      .filter(Boolean)
  );

function redact(
  value = ""
) {
  let text =
    cleanText(
      value,
      ""
    );

  if (!text) {
    return "";
  }

  text =
    text.replace(
      LEGACY_RESET_TOKEN_PATH,
      "$1***"
    );

  try {
    const url =
      new URL(
        text,
        "https://onionsupport.local"
      );

    for (
      const key
      of [
        ...url
          .searchParams
          .keys(),
      ]
    ) {
      if (
        SENSITIVE_KEYS.has(
          normalizeKey(
            key
          )
        )
      ) {
        url.searchParams.set(
          key,
          "***"
        );
      }
    }

    text =
      /^https?:\/\//i.test(
        text
      )
        ? url.toString()
        : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    text =
      text.replace(
        /([?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken|sas)=)([^&#\s]+)/gi,
        "$1***"
      );
  }

  return text
    .replace(
      LEGACY_RESET_TOKEN_PATH,
      "$1***"
    )
    .replace(
      /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
      "$1***"
    )
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function sanitizeData(
  value,
  depth = 0
) {
  if (
    depth > 5
  ) {
    return null;
  }

  if (
    value === undefined
  ) {
    return undefined;
  }

  if (
    value === null
  ) {
    return null;
  }

  const type =
    typeof value;

  if (
    type === "string"
  ) {
    return redact(
      value
    ).slice(
      0,
      1200
    );
  }

  if (
    type === "number" ||
    type === "boolean"
  ) {
    return value;
  }

  if (
    type === "function" ||
    type === "symbol" ||
    type === "bigint"
  ) {
    return undefined;
  }

  if (
    isBlob(value)
  ) {
    return {
      type:
        value.type ||
        "",

      size:
        value.size ||
        0,

      blob: true,
    };
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(
        0,
        100
      )
      .map(
        (item) =>
          sanitizeData(
            item,
            depth + 1
          )
      )
      .filter(
        (item) =>
          item !==
          undefined
      );
  }

  if (
    !isPlainObject(value)
  ) {
    return null;
  }

  const output = {};

  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      SENSITIVE_KEYS.has(
        normalizeKey(
          key
        )
      ) ||
      /(token|authorization|cookie|password|pwd|secret|credential|jwt|bearer|refresh|access|api[_-]?key|connection[_-]?string|sas|session[_-]?id|^_rid$|^_self$|^_etag$|^_attachments$|^_ts$)/i.test(
        key
      )
    ) {
      output[key] =
        child
          ? "***"
          : null;

      continue;
    }

    const clean =
      sanitizeData(
        child,
        depth + 1
      );

    if (
      clean !== undefined
    ) {
      output[key] =
        clean;
    }
  }

  return output;
}

export function redactHttpText(
  value = ""
) {
  return redact(
    value
  );
}

/* =========================================================
   API URL
========================================================= */

function getApiOrigin() {
  return (
    DEFAULT_API_BASE ||
    getApiBase()
  );
}

function endpointToPath(
  endpoint = "/"
) {
  const raw =
    cleanText(
      endpoint,
      ""
    );

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(
        raw,
        getApiOrigin()
      );

    const normalizedPath =
      normalizeEndpointPath(
        parsed.pathname
      ) ||
      parsed.pathname ||
      "/";

    return (
      `${normalizedPath}${parsed.search}`
    );
  } catch {
    try {
      return (
        endpointPathFromUrlLike(
          raw
        ) ||
        ""
      );
    } catch {
      return "";
    }
  }
}

function endpointPathOnly(
  endpoint = "/"
) {
  try {
    const pathWithQuery =
      endpointToPath(
        endpoint
      );

    const pathname =
      pathWithQuery
        .split("?")[0]
        .split("#")[0];

    return (
      normalizeEndpointPath(
        pathname
      ) ||
      ""
    );
  } catch {
    return "";
  }
}

function appendQuery(
  url = "",
  query = null
) {
  const parsed =
    new URL(
      url
    );

  if (
    isPlainObject(query)
  ) {
    for (
      const [
        key,
        value,
      ]
      of Object.entries(
        query
      )
    ) {
      if (
        SENSITIVE_KEYS.has(
          normalizeKey(
            key
          )
        )
      ) {
        continue;
      }

      if (
        value === undefined ||
        value === null ||
        value === ""
      ) {
        continue;
      }

      if (
        Array.isArray(value)
      ) {
        for (
          const item
          of value
        ) {
          if (
            item !== undefined &&
            item !== null &&
            item !== ""
          ) {
            parsed
              .searchParams
              .append(
                key,
                String(item)
              );
          }
        }

        continue;
      }

      parsed
        .searchParams
        .set(
          key,
          String(value)
        );
    }
  }

  for (
    const key
    of [
      ...parsed
        .searchParams
        .keys(),
    ]
  ) {
    if (
      SENSITIVE_KEYS.has(
        normalizeKey(
          key
        )
      )
    ) {
      parsed
        .searchParams
        .delete(
          key
        );
    }
  }

  return parsed.toString();
}

export function buildApiUrl(
  endpoint = "/",
  options = {}
) {
  const path =
    endpointToPath(
      endpoint
    );

  if (!path) {
    return "";
  }

  const base =
    getApiOrigin()
      .replace(
        /\/+$/g,
        ""
      );

  const cleanPath =
    path.startsWith("/")
      ? path
      : `/${path}`;

  return appendQuery(
    `${base}${cleanPath}`,
    options.query ||
    options.params ||
    null
  );
}

/* =========================================================
   TOKEN / CORE
========================================================= */

function cleanToken(
  value = ""
) {
  const token =
    cleanText(
      value,
      ""
    ).replace(
      /^Bearer\s+/i,
      ""
    );

  if (!token) {
    return "";
  }

  if (
    /\s/.test(token)
  ) {
    return "";
  }

  if (
    token.length >
    8192
  ) {
    return "";
  }

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "[object object]",
      "{}",
      "[]",
    ].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

let appCore = null;

function runtimeStatePort() {
  const port =
    appCore?.runtimeState;

  return (
    isObject(port) &&
    isFunction(port.read) &&
    isFunction(port.write)
  )
    ? port
    : null;
}

function readCoreState() {
  if (!appCore) {
    return null;
  }

  try {
    const port =
      runtimeStatePort();

    if (port) {
      return port.read();
    }

    if (
      isFunction(
        appCore.getRuntimeState
      )
    ) {
      return appCore.getRuntimeState();
    }

    if (
      isFunction(
        appCore.getState
      )
    ) {
      return appCore.getState({
        raw: true,
        includeToken: true,
      });
    }
  } catch {
    // fallback abajo
  }

  return isObject(
    appCore.state
  )
    ? appCore.state
    : null;
}

function writeCoreState(
  patch = {}
) {
  if (
    !isObject(patch) ||
    !appCore
  ) {
    return false;
  }

  try {
    const port =
      runtimeStatePort();

    if (port) {
      port.write(
        patch
      );

      return true;
    }

    if (
      isFunction(
        appCore.setRuntimeState
      )
    ) {
      appCore.setRuntimeState(
        patch
      );

      return true;
    }

    if (
      isFunction(
        appCore.setState
      )
    ) {
      appCore.setState(
        patch,
        {
          raw: true,
          source:
            "http",
        }
      );

      return true;
    }
  } catch {
    // noop
  }

  return false;
}

function authPayloadSources(
  payload = {}
) {
  if (
    !isObject(payload)
  ) {
    return [];
  }

  return [
    payload,
    payload.data,
    payload.payload,
    payload.result,
    payload.auth,
  ].filter(isObject);
}

function pickAuthPayloadValue(
  payload = {},
  names = []
) {
  for (
    const source
    of authPayloadSources(
      payload
    )
  ) {
    for (
      const name
      of names
    ) {
      const value =
        source?.[name];

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }
  }

  return undefined;
}

function authTokensFromPayload(
  payload = {}
) {
  const token =
    cleanToken(
      pickAuthPayloadValue(
        payload,
        [
          "token",
          "accessToken",
          "access_token",
        ]
      ) ||
      ""
    );

  return {
    token,
    accessToken:
      token,
    access_token:
      token,
  };
}

function authPatchFromPayload(
  payload = {}
) {
  if (
    !isObject(payload)
  ) {
    return {};
  }

  const patch = {};

  const token =
    pickAuthPayloadValue(
      payload,
      [
        "token",
        "accessToken",
        "access_token",
      ]
    );

  const user =
    pickAuthPayloadValue(
      payload,
      [
        "user",
        "currentUser",
        "usuario",
        "me",
        "account",
      ]
    );

  const session =
    pickAuthPayloadValue(
      payload,
      [
        "session",
        "sessionData",
        "currentSession",
      ]
    );

  if (
    token !== undefined
  ) {
    patch.token =
      token;
  }

  if (
    user !== undefined
  ) {
    patch.user =
      user;
  }

  if (
    session !== undefined
  ) {
    patch.session =
      session;
  }

  if (
    payload.hasRefreshToken !==
    undefined
  ) {
    patch.hasRefreshToken =
      payload.hasRefreshToken ===
      true;
  }

  return patch;
}

export function getAccessToken() {
  const state =
    readCoreState();

  if (
    !isObject(state)
  ) {
    return "";
  }

  return cleanToken(
    first(
      state.token,
      state.accessToken,
      state.access_token,
      ""
    )
  );
}

export function setAccessToken(
  token = ""
) {
  const value =
    cleanToken(
      token
    );

  writeCoreState({
    token:
      value ||
      null,
  });

  return value;
}

export function clearAuthTokens() {
  writeCoreState({
    token: null,
  });

  return true;
}

export function setAuthTokens(
  payload = {}
) {
  const tokens =
    authTokensFromPayload(
      payload
    );

  if (
    tokens.token
  ) {
    writeCoreState({
      token:
        tokens.token,
    });
  }

  return tokens;
}

function applyAuthPayload(
  payload = {}
) {
  const tokens =
    authTokensFromPayload(
      payload
    );

  const patch =
    authPatchFromPayload(
      payload
    );

  if (
    Object.keys(patch)
      .length
  ) {
    writeCoreState(
      patch
    );
  }

  return tokens;
}

/* =========================================================
   AUTH POLICY
========================================================= */

const NON_REFRESHABLE_AUTH_CODES =
  new Set([
    "INVALID_CREDENTIALS",
    "BAD_CREDENTIALS",
    "LOGIN_FAILED",
    "MFA_REQUIRED",
    "2FA_REQUIRED",
    "OTP_REQUIRED",

    "SESSION_REVOKED",
    "SESSION_INVALID",
    "SESSION_NOT_FOUND",
    "REFRESH_TOKEN_REVOKED",
    "REFRESH_TOKEN_INVALID",
    "REFRESH_TOKEN_EXPIRED",

    "USER_DISABLED",
    "USER_DESACTIVADO",
    "USUARIO_DESACTIVADO",
    "USER_DELETED",
    "USER_ARCHIVED",
    "USER_BLOCKED",
    "USER_BANNED",
    "USER_SUSPENDED",
  ]);

function endpointIsPublic(
  endpoint = ""
) {
  const path =
    endpointPathOnly(
      endpoint
    );

  if (!path) {
    return false;
  }

  try {
    return (
      configIsPublicApiPath(
        path
      ) === true
    );
  } catch {
    return false;
  }
}

function endpointIsPrivate(
  endpoint = ""
) {
  const path =
    endpointPathOnly(
      endpoint
    );

  if (!path) {
    return false;
  }

  try {
    return (
      configIsPrivateApiPath(
        path
      ) === true
    );
  } catch {
    return false;
  }
}

function shouldUseAuth(
  endpoint = "",
  options = {}
) {
  if (
    options.auth === false ||
    options.public === true ||
    options.skipAuth === true ||
    options.noAuthHeader === true
  ) {
    return false;
  }

  if (
    options.auth === true
  ) {
    return true;
  }

  if (
    endpointIsPrivate(
      endpoint
    )
  ) {
    return true;
  }

  if (
    endpointIsPublic(
      endpoint
    )
  ) {
    return false;
  }

  /*
    Endpoints no clasificados se consideran privados.
    Mantiene el comportamiento existente fail-closed.
  */
  return true;
}

function isRefreshEndpoint(
  endpoint = ""
) {
  const path =
    endpointPathOnly(
      endpoint
    );

  return Boolean(
    path &&
    path ===
      endpointPathOnly(
        AUTH_ENDPOINTS.refresh
      )
  );
}

export function isAuthError(
  error = null
) {
  const status =
    Number(
      error?.status ||
      error?.statusCode ||
      0
    );

  return (
    status === 401 ||
    status === 403
  );
}

export function shouldClearSessionForAuthError(
  error = null
) {
  const status =
    Number(
      error?.status ||
      error?.statusCode ||
      0
    );

  const code =
    normalizeCode(
      error?.code ||
      error?.payload?.code ||
      error?.payload?.error ||
      ""
    );

  if (
    isRefreshEndpoint(
      error?.endpoint ||
      ""
    ) &&
    (
      status === 401 ||
      status === 403
    )
  ) {
    return true;
  }

  return (
    NON_REFRESHABLE_AUTH_CODES.has(
      code
    )
  );
}

export function isRefreshableAuthError(
  error = null
) {
  const status =
    Number(
      error?.status ||
      error?.statusCode ||
      0
    );

  const code =
    normalizeCode(
      error?.code ||
      error?.payload?.code ||
      error?.payload?.error ||
      ""
    );

  if (
    status !== 401
  ) {
    return false;
  }

  if (
    isRefreshEndpoint(
      error?.endpoint ||
      ""
    )
  ) {
    return false;
  }

  if (
    shouldClearSessionForAuthError(
      error
    )
  ) {
    return false;
  }

  if (
    NON_REFRESHABLE_AUTH_CODES.has(
      code
    )
  ) {
    return false;
  }

  return true;
}

function shouldAutoRefresh(
  endpoint = "",
  options = {},
  error = null
) {
  if (
    options.noAutoRefresh === true ||
    options.skipRefresh === true ||
    options.refresh === false ||
    options.__retryAfterRefresh === true ||
    options.__internalRefresh === true
  ) {
    return false;
  }

  if (
    isRefreshEndpoint(
      endpoint
    )
  ) {
    return false;
  }

  if (
    !shouldUseAuth(
      endpoint,
      options
    )
  ) {
    return false;
  }

  return (
    isRefreshableAuthError(
      error
    )
  );
}

function shouldClearSessionForRequest(
  endpoint = "",
  options = {},
  error = null
) {
  /*
    Un error de login/password-reset/activate-account no debe borrar
    una sesión existente sólo por reutilizar un código auth del backend.

    Sólo limpiamos sesión automáticamente cuando:
    - era una request autenticada; o
    - falló el propio endpoint de refresh.
  */
  if (
    !shouldUseAuth(
      endpoint,
      options
    ) &&
    !isRefreshEndpoint(
      endpoint
    )
  ) {
    return false;
  }

  return (
    shouldClearSessionForAuthError(
      error
    )
  );
}

function clearCoreSessionIfFinal(
  endpoint = "",
  options = {},
  error = null
) {
  if (
    !shouldClearSessionForRequest(
      endpoint,
      options,
      error
    )
  ) {
    return false;
  }

  if (
    writeCoreState({
      token: null,
      user: null,
      session: null,
      hasRefreshToken:
        false,
    })
  ) {
    return true;
  }

  try {
    if (
      isFunction(
        appCore?.clearSession
      )
    ) {
      appCore.clearSession();
      return true;
    }
  } catch {
    // fallback abajo
  }

  clearAuthTokens();

  return true;
}

/* =========================================================
   HEADERS / BODY
========================================================= */

function headersFrom(
  input = null
) {
  const headers = {};

  if (!input) {
    return headers;
  }

  if (
    typeof Headers !==
      "undefined" &&
    input instanceof Headers
  ) {
    input.forEach(
      (value, key) => {
        headers[key] =
          value;
      }
    );

    return headers;
  }

  if (
    Array.isArray(input)
  ) {
    for (
      const item
      of input
    ) {
      if (
        !Array.isArray(
          item
        ) ||
        item.length < 2
      ) {
        continue;
      }

      const key =
        cleanText(
          item[0],
          ""
        );

      if (key) {
        headers[key] =
          item[1];
      }
    }

    return headers;
  }

  if (
    isObject(input)
  ) {
    return {
      ...input,
    };
  }

  return headers;
}

function hasHeader(
  headers = {},
  name = ""
) {
  const target =
    cleanText(
      name,
      ""
    ).toLowerCase();

  return Object.keys(
    headers
  ).some(
    (key) =>
      key.toLowerCase() ===
      target
  );
}

function setHeader(
  headers = {},
  name = "",
  value = ""
) {
  const target =
    cleanText(
      name,
      ""
    );

  if (!target) {
    return headers;
  }

  for (
    const key
    of Object.keys(
      headers
    )
  ) {
    if (
      key.toLowerCase() ===
      target.toLowerCase()
    ) {
      headers[key] =
        value;

      return headers;
    }
  }

  headers[target] =
    value;

  return headers;
}

function deleteHeader(
  headers = {},
  name = ""
) {
  const target =
    cleanText(
      name,
      ""
    ).toLowerCase();

  for (
    const key
    of Object.keys(
      headers
    )
  ) {
    if (
      key.toLowerCase() ===
      target
    ) {
      delete headers[key];
    }
  }

  return headers;
}

function getResponseType(
  options = {}
) {
  return cleanText(
    options.responseType,
    ""
  ).toLowerCase();
}

function isBinaryResponse(
  options = {}
) {
  return (
    BINARY_RESPONSE_TYPES.has(
      getResponseType(
        options
      )
    )
  );
}

function buildDefaultAccept(
  options = {}
) {
  const responseType =
    getResponseType(
      options
    );

  if (
    responseType === "blob"
  ) {
    return (
      "application/pdf, application/octet-stream, */*"
    );
  }

  if (
    responseType ===
      "arraybuffer" ||
    responseType ===
      "array-buffer"
  ) {
    return (
      "application/octet-stream, application/pdf, */*"
    );
  }

  return (
    "application/json, text/plain, */*"
  );
}

function isBodyInit(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return false;
  }

  if (
    typeof FormData !==
      "undefined" &&
    value instanceof FormData
  ) {
    return true;
  }

  if (
    typeof URLSearchParams !==
      "undefined" &&
    value instanceof URLSearchParams
  ) {
    return true;
  }

  if (
    typeof Blob !==
      "undefined" &&
    value instanceof Blob
  ) {
    return true;
  }

  if (
    typeof ArrayBuffer !==
      "undefined" &&
    value instanceof ArrayBuffer
  ) {
    return true;
  }

  if (
    typeof ArrayBuffer !==
      "undefined" &&
    ArrayBuffer.isView
      ?.(value)
  ) {
    return true;
  }

  return (
    typeof value ===
    "string"
  );
}

function normalizeBody(
  body = undefined,
  headers = {}
) {
  if (
    body === undefined ||
    body === null
  ) {
    return {
      body:
        undefined,

      headers,
    };
  }

  if (
    isBodyInit(body)
  ) {
    return {
      body,
      headers,
    };
  }

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

    return {
      body:
        JSON.stringify(
          body
        ),

      headers,
    };
  }

  if (
    !hasHeader(
      headers,
      "Content-Type"
    )
  ) {
    setHeader(
      headers,
      "Content-Type",
      "text/plain;charset=UTF-8"
    );
  }

  return {
    body:
      String(body),

    headers,
  };
}

/* =========================================================
   ERRORS
========================================================= */

function extractErrorCode(
  payload = null,
  response = null
) {
  if (
    isObject(payload)
  ) {
    const explicit =
      normalizeCode(
        first(
          payload.code,
          payload.errorCode,
          payload.error_code,
          payload.error,
          payload.name,
          ""
        )
      );

    if (explicit) {
      return explicit;
    }
  }

  if (
    response?.status ===
    400
  ) {
    return "BAD_REQUEST";
  }

  if (
    response?.status ===
    401
  ) {
    return "UNAUTHORIZED";
  }

  if (
    response?.status ===
    403
  ) {
    return "FORBIDDEN";
  }

  if (
    response?.status ===
    404
  ) {
    return "NOT_FOUND";
  }

  if (
    response?.status ===
    408
  ) {
    return "REQUEST_TIMEOUT";
  }

  if (
    response?.status ===
    409
  ) {
    return "CONFLICT";
  }

  if (
    response?.status ===
    422
  ) {
    return "UNPROCESSABLE_ENTITY";
  }

  if (
    response?.status ===
    429
  ) {
    return "TOO_MANY_REQUESTS";
  }

  if (
    response?.status >=
    500
  ) {
    return "SERVER_ERROR";
  }

  return "HTTP_ERROR";
}

function extractErrorMessage(
  payload = null,
  fallback = "Error HTTP"
) {
  if (
    isObject(payload)
  ) {
    return cleanText(
      first(
        payload.message,
        payload.error_description,
        payload.detail,
        payload.title,
        payload.error,
        ""
      ),
      fallback
    ).slice(
      0,
      1200
    );
  }

  if (
    typeof payload ===
    "string"
  ) {
    return cleanText(
      payload,
      fallback
    ).slice(
      0,
      1200
    );
  }

  return fallback;
}

function createHttpError({
  code = "HTTP_ERROR",
  message = "Error HTTP",
  status = 0,
  endpoint = "",
  url = "",
  method = "",
  payload = null,
  response = null,
  cause = null,
} = {}) {
  const error =
    new Error(
      cleanText(
        message,
        "Error HTTP"
      )
    );

  error.name =
    "HttpError";

  error.code =
    normalizeCode(
      code
    );

  error.status =
    Number(
      status ||
      response?.status ||
      0
    );

  error.statusCode =
    error.status;

  error.endpoint =
    redact(
      endpoint
    );

  error.url =
    redact(
      url
    );

  error.method =
    cleanText(
      method,
      ""
    );

  error.payload =
    sanitizeData(
      payload
    );

  error.data =
    error.payload;

  error.response =
    response ||
    null;

  error.cause =
    cause ||
    null;

  return error;
}

/* =========================================================
   FETCH OPTIONS
========================================================= */

function buildFetchOptions(
  endpoint = "",
  options = {}
) {
  const method =
    cleanText(
      options.method,
      "GET"
    ).toUpperCase();

  if (
    !VALID_METHODS.has(
      method
    )
  ) {
    throw createHttpError({
      code:
        "HTTP_METHOD_INVALID",

      message:
        `Método HTTP no permitido: ${method}`,

      endpoint,
    });
  }

  const headers =
    headersFrom(
      options.headers
    );

  if (
    !hasHeader(
      headers,
      "Accept"
    )
  ) {
    setHeader(
      headers,
      "Accept",
      buildDefaultAccept(
        options
      )
    );
  }

  if (
    shouldUseAuth(
      endpoint,
      options
    )
  ) {
    const token =
      getAccessToken();

    if (token) {
      setHeader(
        headers,
        "Authorization",
        `Bearer ${token}`
      );
    } else {
      deleteHeader(
        headers,
        "Authorization"
      );
    }
  } else {
    deleteHeader(
      headers,
      "Authorization"
    );
  }

  let body =
    undefined;

  if (
    !BODYLESS_METHODS.has(
      method
    )
  ) {
    const normalized =
      normalizeBody(
        options.body,
        headers
      );

    body =
      normalized.body;
  }

  const output = {
    method,
    headers,
    body,

    credentials:
      options.credentials ||
      "include",

    cache:
      options.cache ||
      "no-store",

    mode:
      options.mode ||
      "cors",

    redirect:
      options.redirect ||
      "follow",
  };

  if (
    typeof options.keepalive ===
    "boolean"
  ) {
    output.keepalive =
      options.keepalive;
  }

  if (
    options.referrerPolicy
  ) {
    output.referrerPolicy =
      options.referrerPolicy;
  }

  return output;
}

/* =========================================================
   RESPONSE
========================================================= */

function contentTypeOf(
  response
) {
  try {
    return (
      response.headers.get(
        "content-type"
      ) ||
      ""
    );
  } catch {
    return "";
  }
}

function dispositionFilename(
  response
) {
  try {
    const disposition =
      response.headers.get(
        "content-disposition"
      ) ||
      "";

    const utf8 =
      disposition.match(
        /filename\*=UTF-8''([^;]+)/i
      );

    if (
      utf8?.[1]
    ) {
      return decodeURIComponent(
        utf8[1]
      ).replace(
        /["]/g,
        ""
      );
    }

    const ascii =
      disposition.match(
        /filename="?([^";]+)"?/i
      );

    if (
      ascii?.[1]
    ) {
      return ascii[1]
        .replace(
          /["]/g,
          ""
        );
    }
  } catch {
    // noop
  }

  return "";
}

async function parseJsonText(
  response
) {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(
      text
    );
  } catch {
    return text;
  }
}

async function parseResponse(
  response,
  options = {}
) {
  const method =
    cleanText(
      options.method,
      "GET"
    ).toUpperCase();

  if (
    response.status === 204 ||
    response.status === 205 ||
    method === "HEAD"
  ) {
    return null;
  }

  const responseType =
    getResponseType(
      options
    );

  if (
    responseType ===
    "blob"
  ) {
    return response.blob();
  }

  if (
    responseType ===
      "arraybuffer" ||
    responseType ===
      "array-buffer"
  ) {
    return response.arrayBuffer();
  }

  if (
    responseType ===
    "text"
  ) {
    return response.text();
  }

  if (
    responseType ===
    "json"
  ) {
    return parseJsonText(
      response
    );
  }

  const contentType =
    contentTypeOf(
      response
    ).toLowerCase();

  if (
    contentType.includes(
      "application/json"
    ) ||
    contentType.includes(
      "+json"
    )
  ) {
    return parseJsonText(
      response
    );
  }

  if (
    contentType.startsWith(
      "text/"
    ) ||
    contentType.includes(
      "xml"
    ) ||
    contentType.includes(
      "html"
    )
  ) {
    return response.text();
  }

  try {
    return await response.blob();
  } catch {
    return response.text();
  }
}

async function parseErrorPayload(
  response
) {
  const contentType =
    contentTypeOf(
      response
    ).toLowerCase();

  try {
    const text =
      await response.text();

    if (!text) {
      return null;
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
        return JSON.parse(
          text
        );
      } catch {
        return text.slice(
          0,
          1200
        );
      }
    }

    return text.slice(
      0,
      1200
    );
  } catch {
    return null;
  }
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

function normalizeTimeout(
  value = DEFAULT_TIMEOUT_MS
) {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <= 0
  ) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.max(
    1000,
    parsed
  );
}

function createRequestAbort({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  externalSignal = null,
} = {}) {
  if (
    typeof AbortController ===
    "undefined"
  ) {
    return {
      signal:
        externalSignal ||
        undefined,

      timedOut:
        () => false,

      externallyAborted:
        () =>
          Boolean(
            externalSignal
              ?.aborted
          ),

      cleanup:
        () => {},
    };
  }

  const controller =
    new AbortController();

  let timeoutReached =
    false;

  let externalReached =
    false;

  let timer = null;
  let externalListener =
    null;

  const abortFromExternal =
    () => {
      externalReached =
        true;

      try {
        controller.abort(
          externalSignal
            ?.reason
        );
      } catch {
        try {
          controller.abort();
        } catch {
          // noop
        }
      }
    };

  if (
    externalSignal
  ) {
    if (
      externalSignal.aborted
    ) {
      abortFromExternal();
    } else if (
      isFunction(
        externalSignal
          .addEventListener
      )
    ) {
      externalListener =
        abortFromExternal;

      externalSignal.addEventListener(
        "abort",
        externalListener,
        {
          once: true,
        }
      );
    }
  }

  if (
    !controller.signal.aborted
  ) {
    timer =
      setTimeout(
        () => {
          timeoutReached =
            true;

          try {
            controller.abort();
          } catch {
            // noop
          }
        },
        normalizeTimeout(
          timeoutMs
        )
      );
  }

  return {
    signal:
      controller.signal,

    timedOut:
      () =>
        timeoutReached,

    externallyAborted:
      () =>
        externalReached ||
        Boolean(
          externalSignal
            ?.aborted
        ),

    cleanup:
      () => {
        if (timer) {
          clearTimeout(
            timer
          );

          timer = null;
        }

        if (
          externalSignal &&
          externalListener &&
          isFunction(
            externalSignal
              .removeEventListener
          )
        ) {
          try {
            externalSignal
              .removeEventListener(
                "abort",
                externalListener
              );
          } catch {
            // noop
          }
        }

        externalListener =
          null;
      },
  };
}

/* =========================================================
   STATS
========================================================= */

let refreshPromise = null;
let lastRefreshAt = null;
let lastRefreshError = null;

const stats = {
  total: 0,
  success: 0,
  error: 0,

  aborted: 0,
  timeout: 0,
  networkError: 0,

  refresh: 0,
  refreshSuccess: 0,
  refreshError: 0,
  retryAfterRefresh: 0,

  lastMethod: "",
  lastUrl: "",
  lastStatus: null,
  lastError: null,
};

function setLastErrorStat(
  normalized,
  endpoint,
  options
) {
  stats.lastError = {
    code:
      normalized.code,

    status:
      normalized.status,

    message:
      redact(
        normalized.message
      ),

    endpoint:
      redact(
        endpoint
      ),

    binary:
      isBinaryResponse(
        options
      ),
  };
}

/* =========================================================
   REQUEST LOW LEVEL
========================================================= */

function ensureFetch() {
  if (
    typeof fetch !==
    "function"
  ) {
    throw createHttpError({
      code:
        "FETCH_UNAVAILABLE",

      message:
        "fetch() no está disponible.",
    });
  }

  return fetch;
}

async function fetchParsed(
  endpoint = "/",
  options = {}
) {
  const url =
    buildApiUrl(
      endpoint,
      options
    );

  if (!url) {
    throw createHttpError({
      code:
        "HTTP_ENDPOINT_INVALID",

      message:
        "Endpoint API inválido.",

      endpoint,
    });
  }

  const method =
    cleanText(
      options.method,
      "GET"
    ).toUpperCase();

  const fetchOptions =
    buildFetchOptions(
      endpoint,
      {
        ...options,
        method,
      }
    );

  const requestAbort =
    createRequestAbort({
      timeoutMs:
        options.timeout ??
        options.timeoutMs ??
        DEFAULT_TIMEOUT_MS,

      externalSignal:
        options.signal ||
        null,
    });

  if (
    requestAbort.signal
  ) {
    fetchOptions.signal =
      requestAbort.signal;
  }

  stats.total += 1;
  stats.lastMethod =
    method;
  stats.lastUrl =
    redact(
      url
    );
  stats.lastStatus =
    null;
  stats.lastError =
    null;

  try {
    const response =
      await ensureFetch()(
        url,
        fetchOptions
      );

    stats.lastStatus =
      response.status;

    if (
      !response.ok
    ) {
      const errorPayload =
        await parseErrorPayload(
          response
        );

      throw createHttpError({
        code:
          extractErrorCode(
            errorPayload,
            response
          ),

        message:
          extractErrorMessage(
            errorPayload,
            `HTTP ${response.status}`
          ),

        status:
          response.status,

        endpoint,
        url,
        method,

        payload:
          errorPayload,

        response,
      });
    }

    const data =
      await parseResponse(
        response,
        {
          ...options,
          method,
        }
      );

    stats.success += 1;

    return {
      response,
      data,
      url,
      method,
    };
  } catch (error) {
    let normalized =
      error?.name ===
      "HttpError"
        ? error
        : null;

    if (!normalized) {
      const aborted =
        requestAbort
          .externallyAborted();

      const timedOut =
        requestAbort
          .timedOut();

      if (timedOut) {
        stats.timeout += 1;

        normalized =
          createHttpError({
            code:
              "HTTP_TIMEOUT",

            message:
              "La solicitud ha tardado demasiado.",

            endpoint,
            url,
            method,
            cause:
              error,
          });
      } else if (aborted) {
        stats.aborted += 1;

        normalized =
          createHttpError({
            code:
              "HTTP_ABORTED",

            message:
              "La solicitud fue cancelada.",

            endpoint,
            url,
            method,
            cause:
              error,
          });
      } else {
        stats.networkError += 1;

        normalized =
          createHttpError({
            code:
              "NETWORK_ERROR",

            message:
              error?.message ||
              "No se pudo conectar con la API.",

            endpoint,
            url,
            method,
            cause:
              error,
          });
      }
    }

    stats.error += 1;

    setLastErrorStat(
      normalized,
      endpoint,
      options
    );

    throw normalized;
  } finally {
    requestAbort.cleanup();
  }
}

/* =========================================================
   REFRESH / RETRY
========================================================= */

async function runRefresh(
  body = {},
  options = {}
) {
  if (
    refreshPromise
  ) {
    return refreshPromise;
  }

  stats.refresh += 1;
  lastRefreshError =
    null;

  refreshPromise =
    (async () => {
      try {
        const result =
          await fetchParsed(
            AUTH_ENDPOINTS.refresh,
            {
              ...options,

              method:
                "POST",

              body:
                isPlainObject(
                  body
                )
                  ? body
                  : {},

              public: true,
              auth: false,
              noAuthHeader: true,
              noAutoRefresh: true,
              __internalRefresh:
                true,

              source:
                options.source ||
                "core.http.refresh",
            }
          );

        /*
          Un único write canónico aplica token/user/session del refresh.
          Core normaliza, deriva y toca updatedAt una sola vez.
        */
        applyAuthPayload(
          result.data ||
          {}
        );

        stats.refreshSuccess +=
          1;

        lastRefreshAt =
          nowIso();

        lastRefreshError =
          null;

        return result.data;
      } catch (error) {
        stats.refreshError +=
          1;

        lastRefreshError = {
          code:
            error?.code ||
            "REFRESH_FAILED",

          status:
            error?.status ||
            error?.statusCode ||
            null,

          message:
            redact(
              error?.message ||
              "No se pudo renovar la sesión."
            ),

          at:
            nowIso(),
        };

        /*
          Refresh 401/403 o código final de sesión:
          limpiamos Core una sola vez.
        */
        clearCoreSessionIfFinal(
          AUTH_ENDPOINTS.refresh,
          {
            auth: false,
            public: true,
          },
          error
        );

        throw error;
      } finally {
        refreshPromise =
          null;
      }
    })();

  return refreshPromise;
}

async function fetchParsedWithRefresh(
  endpoint = "/",
  options = {}
) {
  try {
    return await fetchParsed(
      endpoint,
      options
    );
  } catch (error) {
    if (
      !shouldAutoRefresh(
        endpoint,
        options,
        error
      )
    ) {
      clearCoreSessionIfFinal(
        endpoint,
        options,
        error
      );

      throw error;
    }

    await runRefresh(
      {},
      {
        timeout:
          options.refreshTimeout ??
          options.timeout ??
          options.timeoutMs ??
          DEFAULT_TIMEOUT_MS,

        source:
          "core.http.auto-refresh",
      }
    );

    stats.retryAfterRefresh +=
      1;

    return fetchParsed(
      endpoint,
      {
        ...options,

        /*
          Garantiza exactamente un retry.
          buildFetchOptions relee el token del Core,
          por lo que usa el access token renovado.
        */
        __retryAfterRefresh:
          true,
      }
    );
  }
}

export async function request(
  endpoint = "/",
  options = {}
) {
  const result =
    await fetchParsedWithRefresh(
      endpoint,
      options
    );

  return result.data;
}

/* =========================================================
   METHODS
========================================================= */

export function get(
  endpoint = "/",
  options = {}
) {
  return request(
    endpoint,
    {
      ...options,
      method: "GET",
    }
  );
}

export function post(
  endpoint = "/",
  body = undefined,
  options = {}
) {
  return request(
    endpoint,
    {
      ...options,
      method: "POST",
      body,
    }
  );
}

export function put(
  endpoint = "/",
  body = undefined,
  options = {}
) {
  return request(
    endpoint,
    {
      ...options,
      method: "PUT",
      body,
    }
  );
}

export function patch(
  endpoint = "/",
  body = undefined,
  options = {}
) {
  return request(
    endpoint,
    {
      ...options,
      method: "PATCH",
      body,
    }
  );
}

export function del(
  endpoint = "/",
  options = {}
) {
  return request(
    endpoint,
    {
      ...options,
      method: "DELETE",
    }
  );
}

export {
  del as delete,
};

/* =========================================================
   AUTH ENDPOINT HELPERS
========================================================= */

export function login(
  payload = {},
  options = {}
) {
  return post(
    AUTH_ENDPOINTS.login,
    payload,
    {
      ...options,

      public: true,
      auth: false,
      noAuthHeader: true,
      noAutoRefresh: true,
    }
  );
}

export function logout(
  options = {}
) {
  return post(
    AUTH_ENDPOINTS.logout,
    {},
    {
      ...options,

      auth: true,
    }
  );
}

export function logoutAll(
  options = {}
) {
  return post(
    AUTH_ENDPOINTS.logoutAll,
    {},
    {
      ...options,

      auth: true,
    }
  );
}

export function me(
  options = {}
) {
  return get(
    AUTH_ENDPOINTS.me,
    {
      ...options,
      auth: true,
    }
  );
}

export function refreshSession(
  body = {},
  options = {}
) {
  return runRefresh(
    body,
    {
      ...options,

      public: true,
      auth: false,
      noAuthHeader: true,
      noAutoRefresh: true,
    }
  );
}

export function activateAccount(
  payload = {},
  options = {}
) {
  return post(
    AUTH_ENDPOINTS.activateAccount,
    payload,
    {
      ...options,

      public: true,
      auth: false,
      noAuthHeader: true,
      noAutoRefresh: true,
    }
  );
}

export function requestPasswordReset(
  payload = {},
  options = {}
) {
  return post(
    AUTH_ENDPOINTS.requestPasswordReset,
    payload,
    {
      ...options,

      public: true,
      auth: false,
      noAuthHeader: true,
      noAutoRefresh: true,
    }
  );
}

export function confirmPasswordReset(
  payload = {},
  options = {}
) {
  return post(
    AUTH_ENDPOINTS.confirmPasswordReset,
    payload,
    {
      ...options,

      public: true,
      auth: false,
      noAuthHeader: true,
      noAutoRefresh: true,
    }
  );
}

/* =========================================================
   BLOBS / DOWNLOADS
========================================================= */

function safeFileName(
  value = "",
  fallback = "descarga"
) {
  const name =
    cleanText(
      value,
      fallback
    )
      .replace(
        /[\\/:*?"<>|#]+/g,
        "_"
      )
      .replace(
        /\s+/g,
        "_"
      )
      .replace(
        /_+/g,
        "_"
      )
      .replace(
        /^[-_.]+|[-_.]+$/g,
        ""
      )
      .slice(
        0,
        180
      );

  return (
    name ||
    fallback
  );
}

export async function blob(
  endpoint = "/",
  options = {}
) {
  return request(
    endpoint,
    {
      ...options,

      method:
        options.method ||
        "GET",

      responseType:
        "blob",
    }
  );
}

export async function arrayBuffer(
  endpoint = "/",
  options = {}
) {
  return request(
    endpoint,
    {
      ...options,

      method:
        options.method ||
        "GET",

      responseType:
        "arrayBuffer",
    }
  );
}

export async function downloadBlob(
  endpoint = "/",
  options = {}
) {
  const result =
    await fetchParsedWithRefresh(
      endpoint,
      {
        ...options,

        method:
          options.method ||
          "GET",

        responseType:
          "blob",
      }
    );

  const data =
    result.data;

  const filename =
    safeFileName(
      dispositionFilename(
        result.response
      ) ||
      options.filename ||
      "descarga",
      "descarga"
    );

  const contentType =
    contentTypeOf(
      result.response
    );

  if (
    typeof Blob ===
      "undefined" ||
    !(data instanceof Blob)
  ) {
    throw createHttpError({
      code:
        "HTTP_BLOB_RESPONSE_INVALID",

      message:
        "La respuesta de descarga no es un Blob válido.",

      endpoint,

      url:
        result.url,

      method:
        result.method,

      payload:
        data,

      response:
        result.response,
    });
  }

  if (
    options.autoDownload !==
      false &&
    isBrowser()
  ) {
    const objectUrl =
      URL.createObjectURL(
        data
      );

    const link =
      document.createElement(
        "a"
      );

    link.href =
      objectUrl;

    link.download =
      filename;

    link.rel =
      "noopener";

    document.body.appendChild(
      link
    );

    link.click();
    link.remove();

    setTimeout(
      () => {
        try {
          URL.revokeObjectURL(
            objectUrl
          );
        } catch {
          // noop
        }
      },
      1000
    );
  }

  return {
    ok: true,

    blob:
      data,

    filename,

    contentType,

    size:
      data.size ||
      null,

    response:
      result.response,

    url:
      result.url,
  };
}

export const download =
  downloadBlob;

export const downloadFactura =
  downloadBlob;

/* =========================================================
   INSTALL / SNAPSHOT
========================================================= */

export function install(
  core = null
) {
  appCore =
    core ||
    appCore;

  try {
    appCore
      ?.registerModule
      ?.(
        "http",
        Http,
        {
          overwrite: true,
        }
      );
  } catch {
    // noop
  }

  return Http;
}

export function getSnapshot() {
  return Object.freeze({
    version:
      HTTP_VERSION,

    apiBase:
      getApiOrigin(),

    installed:
      Boolean(
        appCore
      ),

    runtimeStatePort:
      Boolean(
        runtimeStatePort()
      ),

    hasToken:
      Boolean(
        getAccessToken()
      ),

    endpoints:
      AUTH_ENDPOINTS,

    stats:
      Object.freeze({
        total:
          stats.total,

        success:
          stats.success,

        error:
          stats.error,

        aborted:
          stats.aborted,

        timeout:
          stats.timeout,

        networkError:
          stats.networkError,

        refresh:
          stats.refresh,

        refreshSuccess:
          stats.refreshSuccess,

        refreshError:
          stats.refreshError,

        retryAfterRefresh:
          stats.retryAfterRefresh,

        lastMethod:
          stats.lastMethod,

        lastUrl:
          redact(
            stats.lastUrl
          ),

        lastStatus:
          stats.lastStatus,

        lastError:
          sanitizeData(
            stats.lastError
          ),
      }),

    refresh:
      Object.freeze({
        inFlight:
          Boolean(
            refreshPromise
          ),

        lastRefreshAt,

        lastRefreshError:
          sanitizeData(
            lastRefreshError
          ),
      }),

    policy:
      Object.freeze({
        singleClient: true,
        configDriven: true,
        credentialsInclude: true,

        runtimeStateZeroCopyRead:
          true,

        singleCoreWriteOnRefresh:
          true,

        autoRefresh: true,
        singleFlightRefresh: true,
        retryAfterRefreshOnce: true,

        timeout: true,
        externalAbortSignal: true,
        distinguishesAbortFromTimeout: true,

        binaryErrorsParsedAsJsonOrText:
          true,

        downloadUsesBackendFilename:
          true,

        noRouter: true,
        noToast: true,
        noStore: true,
        noServices: true,
        noStorage: true,
      }),
  });
}

export const getDebugSnapshot =
  getSnapshot;

export const snapshot =
  getSnapshot;

/* =========================================================
   API
========================================================= */

export const Http = {
  version:
    HTTP_VERSION,

  AUTH_ENDPOINTS,

  install,

  getApiOrigin,
  buildApiUrl,

  request,
  get,
  post,
  put,
  patch,
  delete:
    del,
  del,

  login,
  logout,
  logoutAll,
  me,
  refreshSession,

  activateAccount,
  requestPasswordReset,
  confirmPasswordReset,

  blob,
  arrayBuffer,
  downloadBlob,
  download,
  downloadFactura,

  getAccessToken,
  setAccessToken,
  setAuthTokens,
  clearAuthTokens,

  isAuthError,
  isRefreshableAuthError,
  shouldClearSessionForAuthError,

  redactHttpText,

  getSnapshot,
  getDebugSnapshot,
  snapshot,
};

export default Http;

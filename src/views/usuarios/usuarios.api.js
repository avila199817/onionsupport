/* =========================================================
   Onion SPA - Usuarios API
   Archivo: src/views/usuarios/usuarios.api.js

   FINAL PRO SYSTEM · API LAYER · 10/10

   RESPONSABILIDADES:
   - centralizar llamadas HTTP del módulo usuarios
   - listado + detalle + create
   - refresh forzado
   - hidratar store/state
   - normalizar payloads backend heterogéneos
   - soportar adapters múltiples de request
   - anti-race soft para listado

   HARDENING PRO:
   - get detalle devuelve objeto limpio
   - soporta { ok, data, user, usuario, item, payload, result }
   - soporta arrays / envelopes / nested envelopes
   - fallback AppCore.apiClient -> AppCore.request -> Http -> fetch
   - persistencia coherente en store/state
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  usuariosState,
  setLoading,
  setRefreshing,
  setError,
  setItems,
  setRemoteCount,
  setLastSyncAt,
  setLoaded,
} from "./usuarios.state.js";

import {
  replaceUsuariosStore,
  upsertUsuarioStore,
} from "./usuarios.store.js";

/* =========================================================
   CONFIG
========================================================= */

const USUARIOS_ENDPOINT = "/api/users";
const USUARIOS_TIMEOUT = 15000;

let lastLoadToken = 0;

/* =========================================================
   SAFE
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function first(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   URL / AUTH
========================================================= */

function getApiBase() {
  const apiBase = safeText(
    AppCore?.config?.apiBase,
    ""
  );

  return apiBase.replace(/\/+$/, "");
}

function buildAbsoluteUrl(path = "") {
  const cleanPath =
    String(path || "").trim();

  if (!cleanPath) {
    return getApiBase();
  }

  if (/^https?:\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  return `${getApiBase()}${cleanPath}`;
}

function getAuthToken() {
  return safeText(
    first(
      AppCore?.state?.token,
      AppCore?.state?.accessToken,
      AppCore?.auth?.getToken?.(),
      AppCore?.Auth?.getToken?.(),
      localStorage.getItem("token"),
      sessionStorage.getItem("token")
    ),
    ""
  );
}

function getRequestHeaders(extra = {}) {
  const token = getAuthToken();

  return {
    ...(token
      ? {
          Authorization:
            `Bearer ${token}`,
        }
      : {}),
    ...extra,
  };
}

function getApiClient() {
  return AppCore?.apiClient || null;
}

function getHttpModule() {
  return (
    AppCore?.modules?.Http ||
    AppCore?.Http ||
    window?.Http ||
    null
  );
}

function getUsuarioEndpoint(id = "") {
  const userId =
    String(id ?? "").trim();

  if (!userId) {
    throw new Error(
      "USUARIO_ID_REQUIRED"
    );
  }

  return `${USUARIOS_ENDPOINT}/${encodeURIComponent(
    userId
  )}`;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function normalizeErrorMessage(
  error = null,
  fallback = "Error de API."
) {
  return safeText(
    first(
      error?.message,
      error?.response?.message,
      error?.response?.data?.message,
      error?.data?.message,
      error?.error,
      fallback
    ),
    fallback
  );
}

function unwrapResponseEnvelope(
  payload = null
) {
  if (
    payload === null ||
    payload === undefined
  ) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj =
    safeObject(payload);

  if (!Object.keys(obj).length) {
    return payload;
  }

  if (Array.isArray(obj.items))
    return obj.items;

  if (Array.isArray(obj.users))
    return obj.users;

  if (Array.isArray(obj.usuarios))
    return obj.usuarios;

  if (Array.isArray(obj.data))
    return obj.data;

  if (Array.isArray(obj.results))
    return obj.results;

  if (obj.user)
    return obj.user;

  if (obj.usuario)
    return obj.usuario;

  if (obj.item)
    return obj.item;

  if (obj.result)
    return obj.result;

  if (obj.payload)
    return unwrapResponseEnvelope(
      obj.payload
    );

  if (
    obj.data &&
    typeof obj.data ===
      "object"
  ) {
    return unwrapResponseEnvelope(
      obj.data
    );
  }

  return obj;
}

function pickItems(
  payload = null
) {
  const unwrapped =
    unwrapResponseEnvelope(
      payload
    );

  if (Array.isArray(unwrapped)) {
    return unwrapped;
  }

  const obj =
    safeObject(payload);

  if (
    Array.isArray(
      obj?.data?.items
    )
  ) {
    return obj.data.items;
  }

  if (
    Array.isArray(
      obj?.data?.users
    )
  ) {
    return obj.data.users;
  }

  if (
    Array.isArray(
      obj?.data?.usuarios
    )
  ) {
    return obj.data.usuarios;
  }

  if (
    Array.isArray(
      obj?.payload?.items
    )
  ) {
    return obj.payload.items;
  }

  if (
    Array.isArray(
      obj?.payload?.users
    )
  ) {
    return obj.payload.users;
  }

  if (
    Array.isArray(
      obj?.payload?.usuarios
    )
  ) {
    return obj.payload.usuarios;
  }

  return [];
}

function pickTotal(
  payload = null,
  fallback = 0
) {
  const obj =
    safeObject(payload);

  const candidates = [
    obj?.total,
    obj?.count,
    obj?.remoteCount,
    obj?.pagination?.total,
    obj?.meta?.total,
    obj?.data?.total,
    obj?.data?.count,
    obj?.payload?.total,
    fallback,
  ];

  for (const value of candidates) {
    const n = Number(value);

    if (Number.isFinite(n)) {
      return n;
    }
  }

  return fallback;
}

function looksLikeUsuario(
  value = null
) {
  const obj =
    safeObject(value);

  return Boolean(
    obj.userId ||
      obj.usuarioId ||
      obj.clientId ||
      obj.id ||
      obj.username ||
      obj.userName ||
      obj.name ||
      obj.nombre ||
      obj.email
  );
}

function pickDetail(
  payload = null
) {
  if (!payload) {
    return null;
  }

  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  if (looksLikeUsuario(payload)) {
    return payload;
  }

  const obj =
    safeObject(payload);

  if (
    looksLikeUsuario(obj.user)
  )
    return obj.user;

  if (
    looksLikeUsuario(
      obj.usuario
    )
  )
    return obj.usuario;

  if (
    looksLikeUsuario(obj.item)
  )
    return obj.item;

  if (
    looksLikeUsuario(
      obj.result
    )
  )
    return obj.result;

  if (
    looksLikeUsuario(
      obj.payload
    )
  )
    return obj.payload;

  if (
    looksLikeUsuario(obj.data)
  )
    return obj.data;

  if (
    obj.data &&
    typeof obj.data ===
      "object"
  ) {
    return pickDetail(
      obj.data
    );
  }

  return Object.keys(obj).length
    ? obj
    : null;
}

/* =========================================================
   REQUEST ADAPTERS
========================================================= */

async function requestViaApiClient(
  method = "GET",
  path = "",
  options = {}
) {
  const client =
    getApiClient();

  if (!client) {
    throw new Error(
      "USUARIOS_API_CLIENT_UNAVAILABLE"
    );
  }

  const verb =
    String(method).toLowerCase();

  if (
    verb === "get" &&
    typeof client.get ===
      "function"
  ) {
    return client.get(path, {
      timeout:
        options.timeout,
      auth: true,
      headers:
        options.headers,
    });
  }

  if (
    verb === "post" &&
    typeof client.post ===
      "function"
  ) {
    return client.post(
      path,
      options.body,
      {
        timeout:
          options.timeout,
        auth: true,
        headers:
          options.headers,
      }
    );
  }

  if (
    typeof client.request ===
    "function"
  ) {
    return client.request(path, {
      method:
        method.toUpperCase(),
      timeout:
        options.timeout,
      auth: true,
      headers:
        options.headers,
      body: options.body,
    });
  }

  throw new Error(
    "USUARIOS_API_CLIENT_METHOD_UNAVAILABLE"
  );
}

async function requestViaAppCoreRequest(
  method = "GET",
  path = "",
  options = {}
) {
  if (
    typeof AppCore?.request !==
    "function"
  ) {
    throw new Error(
      "APP_CORE_REQUEST_UNAVAILABLE"
    );
  }

  return AppCore.request(path, {
    method:
      method.toUpperCase(),
    headers:
      options.headers,
    body:
      options.body &&
      typeof options.body !==
        "string"
        ? JSON.stringify(
            options.body
          )
        : options.body,
  });
}

async function requestViaHttpModule(
  method = "GET",
  path = "",
  options = {}
) {
  const Http =
    getHttpModule();

  if (!Http) {
    throw new Error(
      "HTTP_MODULE_UNAVAILABLE"
    );
  }

  const verb =
    String(method).toLowerCase();

  if (
    verb === "get" &&
    typeof Http.get ===
      "function"
  ) {
    return Http.get(path, {
      headers:
        options.headers,
      timeout:
        options.timeout,
    });
  }

  if (
    verb === "post" &&
    typeof Http.post ===
      "function"
  ) {
    return Http.post(
      path,
      options.body,
      {
        headers:
          options.headers,
        timeout:
          options.timeout,
      }
    );
  }

  if (
    typeof Http.request ===
      "function"
  ) {
    return Http.request(path, {
      method:
        method.toUpperCase(),
      headers:
        options.headers,
      timeout:
        options.timeout,
      body: options.body,
    });
  }

  throw new Error(
    "HTTP_MODULE_METHOD_UNAVAILABLE"
  );
}

async function requestViaFetch(
  method = "GET",
  path = "",
  options = {}
) {
  const controller =
    new AbortController();

  const timeout =
    safeNumber(
      options.timeout,
      USUARIOS_TIMEOUT
    );

  const timeoutId =
    setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, timeout);

  try {
    const response =
      await fetch(
        buildAbsoluteUrl(path),
        {
          method:
            method.toUpperCase(),
          headers:
            options.headers,
          body:
            options.body ==
              null
              ? undefined
              : JSON.stringify(
                  options.body
                ),
          signal:
            controller.signal,
        }
      );

    const text =
      await response.text();

    let data = null;

    try {
      data = text
        ? JSON.parse(text)
        : null;
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      throw new Error(
        normalizeErrorMessage(
          data,
          `HTTP ${response.status}`
        )
      );
    }

    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(
  method = "GET",
  path = "",
  options = {}
) {
  const requestOptions = {
    timeout:
      safeNumber(
        options.timeout,
        USUARIOS_TIMEOUT
      ),
    body: options.body,
    headers:
      getRequestHeaders({
        ...(options.body
          ? {
              "Content-Type":
                "application/json",
            }
          : {}),
        ...safeObject(
          options.headers
        ),
      }),
  };

  const adapters = [
    requestViaApiClient,
    requestViaAppCoreRequest,
    requestViaHttpModule,
    requestViaFetch,
  ];

  let lastError = null;

  for (const adapter of adapters) {
    try {
      return await adapter(
        method,
        path,
        requestOptions
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw (
    lastError ||
    new Error(
      "USUARIOS_REQUEST_FAILED"
    )
  );
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchUsuariosRequest() {
  return request(
    "GET",
    USUARIOS_ENDPOINT,
    {
      timeout:
        USUARIOS_TIMEOUT,
    }
  );
}

export async function getUsuarioByIdRequest(
  id = ""
) {
  const response =
    await request(
      "GET",
      getUsuarioEndpoint(id),
      {
        timeout:
          USUARIOS_TIMEOUT,
      }
    );

  return pickDetail(response);
}

export async function createUsuarioRequest(
  payload = {}
) {
  const response =
    await request(
      "POST",
      USUARIOS_ENDPOINT,
      {
        timeout:
          USUARIOS_TIMEOUT,
        body: safeObject(
          payload
        ),
      }
    );

  return (
    pickDetail(response) ||
    response
  );
}

/* =========================================================
   CACHE HYDRATE
========================================================= */

export function hydrateFromCache() {
  try {
    const current =
      safeArray(
        usuariosState?.items
      );

    if (current.length) {
      replaceUsuariosStore(
        current
      );
    }

    return current;
  } catch {
    return [];
  }
}

/* =========================================================
   LOAD LIST
========================================================= */

export async function loadUsuarios({
  force = false,
} = {}) {
  const loadToken =
    nextLoadToken();

  const firstLoad =
    !Boolean(
      usuariosState?.hydrated
    );

  const shouldShowLoading =
    firstLoad && !force;

  try {
    setError(null);

    if (shouldShowLoading) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    const response =
      await fetchUsuariosRequest();

    const list =
      safeArray(
        pickItems(response)
      );

    const remoteCount =
      pickTotal(
        response,
        list.length
      );

    if (
      !isActiveLoadToken(
        loadToken
      )
    ) {
      return safeArray(
        usuariosState?.items
      );
    }

    replaceUsuariosStore(
      list
    );

    setItems(list);
    setRemoteCount(
      remoteCount
    );
    setLastSyncAt(
      Date.now()
    );
    setLoaded(true);
    setError(null);

    return list;
  } catch (error) {
    if (
      isActiveLoadToken(
        loadToken
      )
    ) {
      setError(
        normalizeErrorMessage(
          error,
          "No se pudieron cargar los usuarios."
        )
      );

      setLoaded(true);
    }

    throw error;
  } finally {
    if (
      isActiveLoadToken(
        loadToken
      )
    ) {
      setLoading(false);
      setRefreshing(false);
    }
  }
}

/* =========================================================
   DETAIL
========================================================= */

export async function loadUsuarioDetail(
  userId = ""
) {
  const detail =
    await getUsuarioByIdRequest(
      userId
    );

  if (detail) {
    upsertUsuarioStore?.(
      detail
    );
  }

  return detail;
}

/* =========================================================
   CREATE
========================================================= */

export async function createUsuario(
  payload = {}
) {
  const created =
    await createUsuarioRequest(
      payload
    );

  if (created) {
    upsertUsuarioStore?.(
      created
    );
  }

  return created;
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  fetchUsuariosRequest,
  getUsuarioByIdRequest,
  createUsuarioRequest,
  hydrateFromCache,
  loadUsuarios,
  loadUsuarioDetail,
  createUsuario,
};

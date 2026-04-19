/* =========================================================
   Onion SPA - Shared Collection API
   Archivo: src/shared/api/collectionApi.js

   RESPONSABILIDADES:
   - crear APIs reutilizables de colección/CRUD
   - unificar list / detail / create / update / patch / remove
   - normalizar respuestas heterogéneas de backend
   - construir query params consistentes
   - tolerar distintos nombres de payload/lista/total
   - no acoplar lógica de dominio (facturas/tickets/etc.)
   - integrarse con AppCore.apiClient o cliente inyectado

   HARDENING PRO:
   - endpoints configurables
   - hooks de normalización extensibles
   - soporte AbortSignal / timeout / auth / raw vía options
   - paths seguros
   - filtros limpios sin null/undefined vacíos
   - sort flexible
   - paginación flexible
   - respuesta de colección consistente
========================================================= */

import { AppCore } from "../../core/index.js";

/* =========================================================
   BASICS
========================================================= */

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

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

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function trimSlashes(value = "") {
  return safeText(value, "").replace(/^\/+|\/+$/g, "");
}

function joinPath(...parts) {
  const cleaned = parts
    .map((part) => safeText(part, ""))
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ""));

  return `/${cleaned.join("/")}`;
}

function serializePrimitive(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }

  return safeText(value, "");
}

function isEmptyQueryValue(value) {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

/* =========================================================
   QUERY HELPERS
========================================================= */

export function cleanQueryParams(input = {}) {
  const source = safeObject(input, {});
  const out = {};

  for (const [key, rawValue] of Object.entries(source)) {
    if (!safeText(key, "")) {
      continue;
    }

    if (isEmptyQueryValue(rawValue)) {
      continue;
    }

    if (Array.isArray(rawValue)) {
      const values = rawValue
        .map((item) => serializePrimitive(item))
        .filter(Boolean);

      if (values.length) {
        out[key] = values;
      }

      continue;
    }

    if (isPlainObject(rawValue)) {
      for (const [nestedKey, nestedValue] of Object.entries(rawValue)) {
        if (isEmptyQueryValue(nestedValue)) {
          continue;
        }

        const composedKey = `${key}.${nestedKey}`;
        const serialized = serializePrimitive(nestedValue);

        if (serialized) {
          out[composedKey] = serialized;
        }
      }

      continue;
    }

    const serialized = serializePrimitive(rawValue);

    if (serialized) {
      out[key] = serialized;
    }
  }

  return out;
}

export function buildListQuery(params = {}, config = {}) {
  const {
    pageParam = "page",
    limitParam = "limit",
    searchParam = "search",
    sortByParam = "sortBy",
    sortDirParam = "sortDir",
    defaultPage = 1,
    defaultLimit = 20,
    includeDefaults = false,
  } = safeObject(config, {});

  const source = safeObject(params, {});
  const query = {};

  const page = safeNumber(source.page, defaultPage);
  const limit = safeNumber(source.limit ?? source.pageSize, defaultLimit);

  const search = safeText(source.search, "");
  const sortBy = safeText(source.sortBy, "");
  const sortDir = safeText(source.sortDir, "");

  if (includeDefaults || page !== defaultPage) {
    query[pageParam] = page;
  }

  if (includeDefaults || limit !== defaultLimit) {
    query[limitParam] = limit;
  }

  if (search) {
    query[searchParam] = search;
  }

  if (sortBy) {
    query[sortByParam] = sortBy;
  }

  if (sortDir) {
    query[sortDirParam] = sortDir;
  }

  if (isPlainObject(source.filters)) {
    Object.assign(query, cleanQueryParams(source.filters));
  }

  if (isPlainObject(source.query)) {
    Object.assign(query, cleanQueryParams(source.query));
  }

  for (const [key, value] of Object.entries(source)) {
    if (
      [
        "page",
        "limit",
        "pageSize",
        "search",
        "sortBy",
        "sortDir",
        "filters",
        "query",
      ].includes(key)
    ) {
      continue;
    }

    if (key in query) {
      continue;
    }

    if (isEmptyQueryValue(value)) {
      continue;
    }

    query[key] = value;
  }

  return cleanQueryParams(query);
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

export function extractCollectionItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  return (
    payload.items ||
    payload.data ||
    payload.results ||
    payload.rows ||
    payload.records ||
    payload.list ||
    payload.collection ||
    []
  );
}

export function extractCollectionTotal(payload, items = []) {
  if (Array.isArray(payload)) {
    return payload.length;
  }

  if (!payload || typeof payload !== "object") {
    return items.length;
  }

  const candidates = [
    payload.total,
    payload.count,
    payload.totalCount,
    payload.recordsTotal,
    payload.pagination?.total,
    payload.meta?.total,
    payload.meta?.count,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }

  return safeArray(items).length;
}

export function extractCollectionPage(payload, fallback = 1) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallback;
  }

  const candidates = [
    payload.page,
    payload.currentPage,
    payload.pagination?.page,
    payload.meta?.page,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }

  return fallback;
}

export function extractCollectionLimit(payload, items = []) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return safeArray(items).length;
  }

  const candidates = [
    payload.limit,
    payload.pageSize,
    payload.perPage,
    payload.pagination?.limit,
    payload.pagination?.pageSize,
    payload.meta?.limit,
    payload.meta?.pageSize,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }

  return safeArray(items).length;
}

export function normalizeCollectionResponse(payload, options = {}) {
  const {
    mapItem,
    mapItems,
    metaResolver,
    fallbackPage = 1,
  } = safeObject(options, {});

  const rawItems = safeArray(extractCollectionItems(payload));

  const items =
    typeof mapItems === "function"
      ? safeArray(mapItems(rawItems, payload))
      : typeof mapItem === "function"
        ? rawItems.map((item, index) => mapItem(item, index, payload))
        : rawItems;

  const total = extractCollectionTotal(payload, items);
  const page = extractCollectionPage(payload, fallbackPage);
  const limit = extractCollectionLimit(payload, items);

  const meta =
    typeof metaResolver === "function"
      ? safeObject(metaResolver(payload, items), {})
      : {};

  return {
    ok: true,
    items,
    total,
    page,
    limit,
    hasItems: items.length > 0,
    isEmpty: items.length === 0,
    raw: payload,
    meta,
  };
}

/* =========================================================
   DETAIL NORMALIZATION
========================================================= */

export function normalizeDetailResponse(payload, options = {}) {
  const { mapDetail } = safeObject(options, {});

  const detail =
    typeof mapDetail === "function"
      ? mapDetail(payload)
      : payload?.item ||
        payload?.data ||
        payload?.result ||
        payload;

  return {
    ok: true,
    item: detail ?? null,
    raw: payload,
  };
}

/* =========================================================
   CLIENT RESOLUTION
========================================================= */

function resolveApiClient(explicitClient = null) {
  if (explicitClient && typeof explicitClient === "object") {
    return explicitClient;
  }

  if (AppCore?.apiClient && typeof AppCore.apiClient === "object") {
    return AppCore.apiClient;
  }

  throw new Error(
    "[collectionApi] No se encontró un apiClient válido. Inyecta client o expón AppCore.apiClient."
  );
}

/* =========================================================
   FACTORY
========================================================= */

export function createCollectionApi(resource, config = {}) {
  const resourceName = trimSlashes(resource);

  if (!resourceName) {
    throw new Error(
      "[collectionApi] 'resource' es obligatorio."
    );
  }

  const {
    client = null,
    basePath = `/${resourceName}`,
    detailPath = null,
    createPath = null,
    updatePath = null,
    patchPath = null,
    removePath = null,
    listQueryConfig = {},
    mapItem = null,
    mapItems = null,
    mapDetail = null,
    normalizeListResponse = null,
    normalizeDetail = null,
    beforeCreate = null,
    beforeUpdate = null,
    beforePatch = null,
  } = safeObject(config, {});

  function getClient() {
    return resolveApiClient(client);
  }

  function getBasePath() {
    return joinPath(basePath);
  }

  function getDetailPath(id) {
    const cleanId = safeText(id, "");
    if (!cleanId) {
      throw new Error(
        `[collectionApi:${resourceName}] 'id' es obligatorio.`
      );
    }

    return detailPath
      ? joinPath(detailPath.replace(":id", cleanId))
      : joinPath(getBasePath(), cleanId);
  }

  function getCreatePath() {
    return createPath ? joinPath(createPath) : getBasePath();
  }

  function getUpdatePath(id) {
    if (updatePath) {
      return joinPath(updatePath.replace(":id", safeText(id, "")));
    }

    return getDetailPath(id);
  }

  function getPatchPath(id) {
    if (patchPath) {
      return joinPath(patchPath.replace(":id", safeText(id, "")));
    }

    return getDetailPath(id);
  }

  function getRemovePath(id) {
    if (removePath) {
      return joinPath(removePath.replace(":id", safeText(id, "")));
    }

    return getDetailPath(id);
  }

  function normalizeList(payload, params = {}) {
    if (typeof normalizeListResponse === "function") {
      return normalizeListResponse(payload, params);
    }

    return normalizeCollectionResponse(payload, {
      mapItem,
      mapItems,
      fallbackPage: safeNumber(params?.page, 1),
    });
  }

  function normalizeOne(payload) {
    if (typeof normalizeDetail === "function") {
      return normalizeDetail(payload);
    }

    return normalizeDetailResponse(payload, {
      mapDetail,
    });
  }

  return {
    resource: resourceName,

    getPath() {
      return getBasePath();
    },

    async list(params = {}, options = {}) {
      const apiClient = getClient();
      const query = buildListQuery(params, listQueryConfig);

      const payload = await apiClient.get(getBasePath(), {
        ...options,
        query,
      });

      return normalizeList(payload, params);
    },

    async detail(id, options = {}) {
      const apiClient = getClient();
      const payload = await apiClient.get(getDetailPath(id), options);
      return normalizeOne(payload);
    },

    async create(data = {}, options = {}) {
      const apiClient = getClient();

      const body =
        typeof beforeCreate === "function"
          ? beforeCreate(data, options)
          : data;

      const payload = await apiClient.post(getCreatePath(), body, options);
      return normalizeOne(payload);
    },

    async update(id, data = {}, options = {}) {
      const apiClient = getClient();

      const body =
        typeof beforeUpdate === "function"
          ? beforeUpdate(data, id, options)
          : data;

      const payload = await apiClient.put(getUpdatePath(id), body, options);
      return normalizeOne(payload);
    },

    async patch(id, data = {}, options = {}) {
      const apiClient = getClient();

      const body =
        typeof beforePatch === "function"
          ? beforePatch(data, id, options)
          : data;

      const payload = await apiClient.patch(getPatchPath(id), body, options);
      return normalizeOne(payload);
    },

    async remove(id, options = {}) {
      const apiClient = getClient();
      const payload = await apiClient.delete(getRemovePath(id), options);

      return {
        ok: true,
        item: payload?.item || payload?.data || payload || null,
        raw: payload,
      };
    },
  };
}

export default createCollectionApi;

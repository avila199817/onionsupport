/* =========================================================
   Onion Support - Clientes API
   Archivo: /src/views/clientes/clientes.api.js

   PRODUCTIVO · CONTRATO BACKEND REAL · HTTP ÚNICO

   Responsabilidad:
   - Ser el único adaptador HTTP de la vista Clientes.
   - Ajustarse al backend productivo actual de /api/clientes.
   - GET /api/clientes          -> listado completo.
   - GET /api/clientes/:id      -> detalle (admin).
   - POST /api/clientes         -> crear/sincronizar (admin).
   - Mantener cache de lectura y dedupe de cargas.
   - No inventar paginación, continuation tokens ni mutaciones
     que el backend todavía no expone.
   - No convertir la respuesta mínima de POST en un cliente falso.
   - Sin fetch propio, DOM, Router ni Auth paralelos.
========================================================= */

import Http from "../../core/http.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const CLIENTES_API_VERSION =
  "clientes.api.backend-contract.v3";

export const CLIENTES_ENDPOINT = "/api/clientes";
export const CLIENTES_CACHE_KEY = "onion.support.clientes.api.cache.v3";
export const CLIENTES_CACHE_TTL_MS = 60_000;

export const CLIENTES_TIMEOUT = 15_000;
export const CLIENTES_DETAIL_TIMEOUT = 20_000;
export const CLIENTES_MUTATION_TIMEOUT = 25_000;

/*
  Compatibilidad con consumidores existentes.
  El backend actual devuelve el listado completo y no pagina.
*/
export const CLIENTES_FETCH_LIMIT = 250;
export const CLIENTES_LIST_LIMIT = CLIENTES_FETCH_LIMIT;
export const CLIENTES_MAX_LIMIT = 500;
export const CLIENTES_MAX_PAGES = 1;

let lastLoadToken = 0;

const clientesState = {
  items: [],
  remoteCount: 0,
  loading: false,
  refreshing: false,
  loaded: false,
  hydrated: false,
  error: "",
  lastSyncAt: 0,
  inflightLoad: null,
};

let clientesStore = [];

/* =========================================================
   SAFE HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;

  if (
    value &&
    typeof value === "object" &&
    typeof value.length === "number" &&
    typeof value !== "string"
  ) {
    try {
      return Array.from(value);
    } catch {
      return [];
    }
  }

  return [];
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

/*
  No aplanar arrays: { clientes: [...] } y { items: [...] }
  son envelopes válidos y deben conservar la colección completa.
*/
function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }

  return null;
}

function number(value = 0, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeSearch(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._+\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();

  if (!email) return "";

  if (
    [
      "null",
      "undefined",
      "none",
      "sin email",
      "sin_email",
      "no email",
      "no_email",
      "__no_email__",
    ].includes(email)
  ) {
    return "";
  }

  return email.includes("@") ? email : "";
}

function firstEmail(...values) {
  for (const value of values) {
    const email = normalizeEmail(value);
    if (email) return email;
  }

  return "";
}

function normalizeClienteType(value = "") {
  const type = normalizeKey(value);

  if (["empresa", "company", "business", "b2b", "autonomo"].includes(type)) {
    return "empresa";
  }

  if (["particular", "persona", "individual", "b2c"].includes(type)) {
    return "particular";
  }

  return "";
}

function safeError(error = null, fallback = "No se pudieron cargar los clientes.") {
  return cleanText(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message,
      error?.response?.data?.message,
      error?.response?.message,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function createContractError(code = "CLIENTES_CONTRACT_ERROR", message = code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   MODEL
========================================================= */

function getRaw(item = {}) {
  return safeObject(item?.raw, safeObject(item));
}

function normalizeStatusValue(value = "", source = {}) {
  const explicit = normalizeKey(
    first(value, source.status, source.estado, source.state, "")
  );

  if (["inactive", "inactivo", "disabled", "archived", "deleted"].includes(explicit)) {
    return "inactive";
  }

  if (["blocked", "bloqueado", "suspended", "locked"].includes(explicit)) {
    return "blocked";
  }

  if (["pending", "pendiente", "new", "nuevo", "invited"].includes(explicit)) {
    return "pending";
  }

  if (["vip", "premium"].includes(explicit)) {
    return "vip";
  }

  if (source.active === false || source.enabled === false || source.disabled === true) {
    return "inactive";
  }

  return "active";
}

function normalizeClienteModel(item = {}) {
  const raw = safeObject(item);
  const contacto = safeObject(first(raw.contacto, raw.contact, raw.profile, {}));
  const direccion = safeObject(first(raw.direccion, raw.address, raw.location, {}));

  const clienteId = cleanText(
    first(
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.uid,
      ""
    ),
    ""
  );

  const userId = cleanText(
    first(raw.userId, raw.usuarioId, raw.ownerUserId, raw.user?.userId, raw.user?.id, ""),
    ""
  );

  const tipo = normalizeClienteType(
    first(raw.tipo, raw.type, raw.clienteTipo, raw.segmento, "")
  ) || cleanText(first(raw.tipo, raw.type, "cliente"), "cliente");

  const nombreFiscal = cleanText(
    first(
      raw.nombreFiscal,
      raw.razonSocial,
      raw.businessName,
      raw.companyName,
      raw.displayName,
      raw.name,
      raw.nombre,
      contacto.nombre,
      clienteId,
      "Cliente"
    ),
    "Cliente"
  );

  const nombreContacto = cleanText(
    first(
      raw.nombreContacto,
      raw.contactoNombre,
      contacto.nombre,
      contacto.name,
      contacto.displayName,
      nombreFiscal,
      ""
    ),
    ""
  );

  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.contactoEmail,
    raw.contactEmail,
    contacto.email,
    contacto.emailLower,
    ""
  );

  const phone = cleanText(
    first(
      raw.phone,
      raw.telefono,
      raw.contactoPhone,
      contacto.phone,
      contacto.telefono,
      ""
    ),
    ""
  );

  const nif = cleanText(
    first(raw.nif, raw.cif, raw.taxId, raw.vatNumber, ""),
    ""
  ).toUpperCase();

  const city = cleanText(
    first(raw.city, raw.ciudad, direccion.ciudad, direccion.city, ""),
    ""
  );

  const avatar = cleanText(
    first(raw.avatar, raw.avatarUrl, raw.photoUrl, raw.picture, ""),
    ""
  );

  const status = normalizeStatusValue(
    first(raw.status, raw.estado, raw.state, ""),
    raw
  );

  const active = status === "active" || status === "vip";
  const createdAt = first(raw.createdAt, raw.created_at, raw.fechaCreacion, null);
  const updatedAt = first(raw.updatedAt, raw.updated_at, raw.modifiedAt, createdAt, null);

  const invoicesCount = number(
    first(raw.invoicesCount, raw.facturasCount, raw.invoiceCount, raw.stats?.facturasCount, 0),
    0
  );

  const ticketsCount = number(
    first(raw.ticketsCount, raw.incidenciasCount, raw.ticketCount, raw.stats?.ticketsCount, 0),
    0
  );

  const totalAmount = number(
    first(raw.totalAmount, raw.totalImporte, raw.facturasTotal, raw.stats?.totalFacturado, 0),
    0
  );

  const normalizedAddress = {
    ...direccion,
    calle: cleanText(first(direccion.calle, direccion.street, raw.calle, ""), ""),
    cp: cleanText(first(direccion.cp, direccion.postalCode, raw.cp, ""), ""),
    ciudad: city,
    city,
    provincia: cleanText(first(direccion.provincia, direccion.province, raw.provincia, ""), ""),
    pais: cleanText(first(direccion.pais, direccion.country, raw.pais, ""), ""),
  };

  const normalizedContact = {
    ...contacto,
    nombre: nombreContacto,
    name: nombreContacto,
    email,
    emailLower: email,
    phone,
    telefono: phone,
  };

  return {
    ...raw,
    raw,

    id: clienteId,
    _id: cleanText(first(raw._id, clienteId), clienteId),
    uid: cleanText(first(raw.uid, clienteId), clienteId),
    clienteId,
    clientId: cleanText(first(raw.clientId, clienteId), clienteId),
    customerId: cleanText(first(raw.customerId, clienteId), clienteId),
    userId,

    code: cleanText(first(raw.code, raw.codigo, clienteId, nif, email), "CLI-SIN-ID"),
    codigo: cleanText(first(raw.codigo, raw.code, clienteId, nif, email), "CLI-SIN-ID"),

    tipo,
    type: tipo,
    clienteTipo: tipo,
    segment: tipo,

    nombreFiscal,
    razonSocial: cleanText(first(raw.razonSocial, nombreFiscal), nombreFiscal),
    businessName: cleanText(first(raw.businessName, nombreFiscal), nombreFiscal),
    companyName: cleanText(first(raw.companyName, nombreFiscal), nombreFiscal),
    displayName: cleanText(first(raw.displayName, nombreFiscal), nombreFiscal),
    fullName: cleanText(first(raw.fullName, nombreFiscal), nombreFiscal),
    name: cleanText(first(raw.name, nombreFiscal), nombreFiscal),
    nombre: cleanText(first(raw.nombre, nombreFiscal), nombreFiscal),

    nombreContacto,
    contactoNombre: nombreContacto,
    contacto: normalizedContact,

    email,
    emailLower: email,
    mail: email,
    contactEmail: email,
    billingEmail: firstEmail(raw.billingEmail, raw.emailFacturacion, email),

    phone,
    telefono: phone,
    mobile: cleanText(first(raw.mobile, raw.movil, phone), phone),

    nif,
    cif: cleanText(first(raw.cif, nif), nif),
    taxId: cleanText(first(raw.taxId, nif), nif),

    direccion: normalizedAddress,
    address: normalizedAddress,
    city,
    ciudad: city,

    avatar,
    avatarUrl: cleanText(first(raw.avatarUrl, avatar), avatar),
    photoUrl: cleanText(first(raw.photoUrl, avatar), avatar),
    picture: cleanText(first(raw.picture, avatar), avatar),
    hasAvatar: Boolean(avatar),

    status,
    estado: status,
    state: status,
    active,
    isActive: active,
    enabled: active,
    blocked: status === "blocked",
    vip: status === "vip",
    isVip: status === "vip",

    createdAt,
    updatedAt,
    lastActivityAt: first(raw.lastActivityAt, updatedAt, createdAt, null),
    lastContactAt: first(raw.lastContactAt, null),
    lastInvoiceAt: first(raw.lastInvoiceAt, null),
    lastTicketAt: first(raw.lastTicketAt, null),

    invoicesCount,
    facturasCount: invoicesCount,
    invoiceCount: invoicesCount,

    ticketsCount,
    incidenciasCount: ticketsCount,
    ticketCount: ticketsCount,

    totalAmount,
    totalImporte: totalAmount,
    facturasTotal: totalAmount,
  };
}

function getClienteStableId(item = {}) {
  const raw = getRaw(item);

  return cleanText(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item._id,
      item.uid,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.uid,
      ""
    ),
    ""
  );
}

function getSortTimestamp(item = {}) {
  const value = first(
    item.lastActivityAt,
    item.updatedAt,
    item.createdAt,
    item.raw?.lastActivityAt,
    item.raw?.updatedAt,
    item.raw?.createdAt,
    0
  );

  const parsedDate = Date.parse(value);
  if (Number.isFinite(parsedDate)) return parsedDate;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 9_999_999_999 ? numeric : numeric * 1000;
  }

  return 0;
}

function compareClientesNewestFirst(a = {}, b = {}) {
  const diff = getSortTimestamp(b) - getSortTimestamp(a);
  if (diff !== 0) return diff;

  return getClienteStableId(a).localeCompare(getClienteStableId(b), "es", {
    numeric: true,
    sensitivity: "base",
  });
}

function dedupeClientes(items = []) {
  const map = new Map();
  let anonymousIndex = 0;

  for (const value of safeArray(items)) {
    if (!isObject(value)) continue;

    const normalized = normalizeClienteModel(value);
    const id = getClienteStableId(normalized) || `anonymous:${anonymousIndex++}`;

    if (map.has(id)) {
      const previous = map.get(id);
      map.set(id, normalizeClienteModel({
        ...previous,
        ...normalized,
        raw: {
          ...safeObject(previous?.raw),
          ...safeObject(normalized?.raw),
        },
      }));
      continue;
    }

    map.set(id, normalized);
  }

  return [...map.values()].sort(compareClientesNewestFirst);
}

function normalizeClientesCollection(items = []) {
  return dedupeClientes(items);
}

function findClienteById(items = [], id = "") {
  const target = cleanText(id, "").toLowerCase();
  if (!target) return null;

  return safeArray(items).find((item) => {
    const normalized = normalizeClienteModel(item);
    const candidates = [
      normalized.clienteId,
      normalized.clientId,
      normalized.customerId,
      normalized.id,
      normalized._id,
      normalized.uid,
      normalized.nif,
      normalized.email,
    ];

    return candidates.some((candidate) => cleanText(candidate, "").toLowerCase() === target);
  }) || null;
}

function statusBucket(item = {}) {
  const status = normalizeStatusValue(
    first(item.status, item.estado, item.state, ""),
    item
  );

  if (status === "vip") return "vip";
  if (status === "pending") return "pending";
  if (["blocked", "inactive"].includes(status)) return "blocked";
  return "active";
}

function clienteSearchText(item = {}) {
  const current = normalizeClienteModel(item);

  return normalizeSearch([
    current.clienteId,
    current.userId,
    current.code,
    current.nombreFiscal,
    current.nombreContacto,
    current.email,
    current.phone,
    current.city,
    current.nif,
    current.tipo,
    current.status,
  ].join(" "));
}

function filterClientes(items = [], { filter = "all", search = "", query = "", q = "" } = {}) {
  const normalizedFilter = normalizeKey(filter || "all");
  const needle = normalizeSearch(first(search, query, q, ""));
  const terms = needle.split(" ").filter(Boolean);

  return safeArray(items).filter((item) => {
    if (normalizedFilter !== "all" && statusBucket(item) !== normalizedFilter) {
      return false;
    }

    if (!terms.length) return true;

    const haystack = clienteSearchText(item);
    return terms.every((term) => haystack.includes(term));
  });
}

function computeClientesStats(items = []) {
  return safeArray(items).reduce(
    (acc, item) => {
      const current = normalizeClienteModel(item);
      const bucket = statusBucket(current);

      acc.total += 1;
      if (bucket === "active") acc.activeCount += 1;
      if (bucket === "pending") acc.pendingCount += 1;
      if (bucket === "blocked") acc.blockedCount += 1;
      if (bucket === "vip") acc.vipCount += 1;

      acc.invoicesCount += number(current.invoicesCount, 0);
      acc.ticketsCount += number(current.ticketsCount, 0);
      acc.totalAmount += number(current.totalAmount, 0);

      return acc;
    },
    {
      total: 0,
      activeCount: 0,
      pendingCount: 0,
      blockedCount: 0,
      vipCount: 0,
      invoicesCount: 0,
      ticketsCount: 0,
      totalAmount: 0,
    }
  );
}

/* =========================================================
   RESPONSE READERS
========================================================= */

function envelopeObjects(payload = null, maxDepth = 6) {
  const output = [];
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();

  while (queue.length) {
    const { value, depth } = queue.shift();

    if (!isObject(value) || seen.has(value) || depth > maxDepth) continue;

    seen.add(value);
    output.push(value);

    for (const key of ["data", "payload", "result", "response", "body", "value"]) {
      if (isObject(value[key])) {
        queue.push({ value: value[key], depth: depth + 1 });
      }
    }
  }

  return output;
}

function pickItems(payload = null) {
  if (Array.isArray(payload)) return payload;

  for (const source of envelopeObjects(payload)) {
    for (const key of ["clientes", "items", "rows", "clients", "customers", "results"]) {
      if (Array.isArray(source[key])) return source[key];
    }
  }

  return [];
}

function pickDetail(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] || null;

  for (const source of envelopeObjects(payload)) {
    for (const key of ["cliente", "client", "customer", "item", "detail", "record"]) {
      if (isObject(source[key])) return source[key];
    }
  }

  const direct = safeObject(payload, null);
  if (!direct) return null;

  return (
    direct.clienteId ||
    direct.id ||
    direct.userId ||
    direct.nombreFiscal
  )
    ? direct
    : null;
}

function normalizeListResponse(response = null) {
  const items = normalizeClientesCollection(pickItems(response));

  return {
    ...safeObject(response),
    ok: safeObject(response)?.ok !== false,
    success: safeObject(response)?.ok !== false,
    items,
    clientes: items,
    clients: items,
    customers: items,
    rows: items,
    results: items,
    total: items.length,
    totalCount: items.length,
    remoteCount: items.length,
    count: items.length,
    returned: items.length,
    hasMore: false,
    continuationToken: null,
    nextContinuationToken: null,
  };
}

function normalizeDetailResponse(response = null) {
  const detail = pickDetail(response);
  return detail ? normalizeClienteModel(detail) : null;
}

/* =========================================================
   STORAGE / STATE
========================================================= */

function isStorageAvailable() {
  if (!isBrowser()) return false;

  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

function readCachePayload() {
  if (!isStorageAvailable()) return null;

  try {
    const raw = window.localStorage.getItem(CLIENTES_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function removeCachePayload() {
  if (!isStorageAvailable()) return false;

  try {
    window.localStorage.removeItem(CLIENTES_CACHE_KEY);
    return true;
  } catch {
    return false;
  }
}

function writeCachePayload() {
  if (!isStorageAvailable()) return false;

  try {
    const payload = {
      version: CLIENTES_API_VERSION,
      items: clientesState.items,
      remoteCount: clientesState.items.length,
      lastSyncAt: clientesState.lastSyncAt || Date.now(),
      cachedAt: Date.now(),
    };

    window.localStorage.setItem(CLIENTES_CACHE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function hydrateStateFromCache({ freshOnly = true } = {}) {
  if (clientesState.loaded && clientesState.items.length) return true;

  const payload = readCachePayload();
  if (!payload) return false;

  const cachedAt = number(payload.cachedAt || payload.lastSyncAt, 0);
  const age = cachedAt ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;

  if (freshOnly && age > CLIENTES_CACHE_TTL_MS) return false;

  const items = normalizeClientesCollection(payload.items);
  if (!items.length) return false;

  clientesState.items = items;
  clientesState.remoteCount = items.length;
  clientesState.lastSyncAt = number(payload.lastSyncAt, cachedAt || Date.now());
  clientesState.hydrated = true;
  clientesState.loaded = true;
  clientesState.error = "";
  clientesStore = items;

  return true;
}

export function hydrateClientesFromCache(options = {}) {
  hydrateStateFromCache({
    freshOnly: options.freshOnly !== false && options.stale !== true,
  });

  const items = [...clientesState.items];
  const lastSyncAt = number(clientesState.lastSyncAt, 0);
  const ageMs = lastSyncAt ? Math.max(0, Date.now() - lastSyncAt) : Number.POSITIVE_INFINITY;
  const ttlMs = number(options.ttlMs ?? options.cacheTtlMs, CLIENTES_CACHE_TTL_MS);

  return {
    ok: Boolean(clientesState.loaded || clientesState.hydrated || items.length),
    cached: Boolean(items.length),
    stale: !lastSyncAt || ageMs > ttlMs,
    items,
    clientes: items,
    clients: items,
    customers: items,
    rows: items,
    results: items,
    total: items.length,
    totalCount: items.length,
    remoteCount: items.length,
    count: items.length,
    loadedAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    lastSyncAt,
    loading: clientesState.loading,
    refreshing: clientesState.refreshing,
    error: clientesState.error,
    cache: {
      hydrated: clientesState.hydrated,
      ageMs,
      ttlMs,
      fresh: Boolean(lastSyncAt) && ageMs <= ttlMs,
      key: CLIENTES_CACHE_KEY,
    },
  };
}

function setLoading(value = false) {
  clientesState.loading = Boolean(value);
  return clientesState.loading;
}

function setRefreshing(value = false) {
  clientesState.refreshing = Boolean(value);
  return clientesState.refreshing;
}

function setError(value = "") {
  clientesState.error = cleanText(value, "");
  return clientesState.error;
}

function clearError() {
  clientesState.error = "";
  return true;
}

function setItems(items = [], { remoteCount = null } = {}) {
  const list = normalizeClientesCollection(items);
  clientesState.items = list;
  clientesStore = list;
  clientesState.remoteCount = Math.max(
    list.length,
    number(remoteCount, list.length)
  );
  return list;
}

function setRemoteCount(value = 0) {
  clientesState.remoteCount = Math.max(0, number(value, clientesState.items.length));
  return clientesState.remoteCount;
}

function setLastSyncAt(value = Date.now()) {
  clientesState.lastSyncAt = number(value, Date.now());
  return clientesState.lastSyncAt;
}

function touchLastSyncAt() {
  return setLastSyncAt(Date.now());
}

function setLoaded(value = true) {
  clientesState.loaded = Boolean(value);
  return clientesState.loaded;
}

function setHydrated(value = true) {
  clientesState.hydrated = Boolean(value);
  return clientesState.hydrated;
}

function getInflightLoad() {
  return clientesState.inflightLoad || null;
}

function setInflightLoad(task = null) {
  clientesState.inflightLoad = task || null;
  return clientesState.inflightLoad;
}

function clearInflightLoad(task = null) {
  if (!task || clientesState.inflightLoad === task) {
    clientesState.inflightLoad = null;
  }

  return true;
}

function replaceClientesStore(items = []) {
  const list = normalizeClientesCollection(items);
  clientesStore = list;
  clientesState.items = list;
  clientesState.remoteCount = Math.max(clientesState.remoteCount, list.length);
  return list;
}

function upsertClienteStore(item = {}) {
  const normalized = normalizeClienteModel(item);
  const id = getClienteStableId(normalized);

  if (!id) return normalized;

  const current = [...clientesStore];
  const index = current.findIndex((row) => getClienteStableId(row) === id);

  if (index >= 0) {
    current[index] = normalizeClienteModel({
      ...current[index],
      ...normalized,
      raw: {
        ...safeObject(current[index]?.raw),
        ...safeObject(normalized?.raw),
      },
    });
  } else {
    current.unshift(normalized);
  }

  clientesStore = normalizeClientesCollection(current);
  clientesState.items = clientesStore;
  clientesState.remoteCount = Math.max(clientesState.remoteCount, clientesStore.length);

  return normalized;
}

function removeClienteStore(id = "") {
  const target = cleanText(id, "").toLowerCase();
  if (!target) return false;

  const before = clientesStore.length;

  clientesStore = clientesStore.filter(
    (item) => getClienteStableId(item).toLowerCase() !== target
  );

  clientesState.items = clientesStore;
  clientesState.remoteCount = clientesStore.length;

  return before !== clientesStore.length;
}

function invalidateReadCache() {
  clientesState.loaded = false;
  clientesState.hydrated = false;
  clientesState.lastSyncAt = 0;
  removeCachePayload();
  return true;
}

/* =========================================================
   HTTP
========================================================= */

async function httpRequest(method = "GET", endpoint = "", body = null, options = {}) {
  const verb = cleanText(method, "GET").toUpperCase();
  const path = cleanText(endpoint, "");

  if (!path) {
    throw createContractError(
      "CLIENTES_ENDPOINT_REQUIRED",
      "Falta el endpoint de Clientes.",
      500
    );
  }

  const timeout = number(options.timeout, CLIENTES_TIMEOUT);
  const query = safeObject(options.query || options.params);
  const headers = safeObject(options.headers);
  const source = cleanText(options.source, "views.clientes.api");

  if (verb === "GET" && isFunction(Http?.get)) {
    return Http.get(path, { timeout, query, headers, source });
  }

  if (verb === "POST" && isFunction(Http?.post)) {
    return Http.post(path, body, { timeout, query, headers, source });
  }

  if (verb === "PUT" && isFunction(Http?.put)) {
    return Http.put(path, body, { timeout, query, headers, source });
  }

  if (verb === "PATCH" && isFunction(Http?.patch)) {
    return Http.patch(path, body, { timeout, query, headers, source });
  }

  if (verb === "DELETE") {
    const remove = Http?.delete || Http?.del;
    if (isFunction(remove)) {
      return remove.call(Http, path, { timeout, query, headers, source });
    }
  }

  if (isFunction(Http?.request)) {
    return Http.request(path, {
      method: verb,
      body,
      data: body,
      timeout,
      query,
      headers,
      source,
    });
  }

  throw createContractError(
    `CLIENTES_HTTP_${verb}_UNAVAILABLE`,
    `El cliente HTTP no expone ${verb} para Clientes.`,
    500
  );
}

/* =========================================================
   PUBLIC LIST API
========================================================= */

export async function fetchClientesRequest(options = {}) {
  const response = await httpRequest(
    "GET",
    CLIENTES_ENDPOINT,
    null,
    {
      timeout: number(options.timeout, CLIENTES_TIMEOUT),
      source: cleanText(options.source, "views.clientes.api.list"),
    }
  );

  return normalizeListResponse(response);
}

export async function loadClientes(options = {}) {
  hydrateStateFromCache({ freshOnly: true });

  const activeInflight = getInflightLoad();
  if (activeInflight && options.force !== true) {
    return activeInflight;
  }

  const token = nextLoadToken();
  const hadItems = clientesState.items.length > 0;

  setLoading(!hadItems);
  setRefreshing(hadItems);
  clearError();

  let task = null;

  task = fetchClientesRequest(options)
    .then((response) => {
      if (!isActiveLoadToken(token)) {
        return getClientesStoreSnapshot();
      }

      const items = setItems(response.items, {
        remoteCount: response.items.length,
      });

      setRemoteCount(items.length);
      touchLastSyncAt();
      setLoaded(true);
      setHydrated(true);
      clearError();
      writeCachePayload();

      return {
        ...response,
        items,
        clientes: items,
        clients: items,
        customers: items,
        rows: items,
        results: items,
        total: items.length,
        totalCount: items.length,
        remoteCount: items.length,
        count: items.length,
        lastSyncAt: clientesState.lastSyncAt,
      };
    })
    .catch((error) => {
      if (isActiveLoadToken(token)) {
        setError(safeError(error));
      }

      throw error;
    })
    .finally(() => {
      if (isActiveLoadToken(token)) {
        setLoading(false);
        setRefreshing(false);
      }

      clearInflightLoad(task);
    });

  setInflightLoad(task);
  return task;
}

export const fetchClientes = loadClientes;
export const listClientes = loadClientes;
export const getClientes = loadClientes;

export async function refreshClientes(options = {}) {
  return loadClientes({
    ...options,
    force: true,
    refresh: true,
  });
}

/* =========================================================
   PUBLIC DETAIL API
========================================================= */

export async function getClienteByIdRequest(id = "", options = {}) {
  const clienteId = cleanText(id, "");

  if (!clienteId) {
    throw createContractError(
      "CLIENTE_ID_REQUIRED",
      "Falta el identificador del cliente."
    );
  }

  const response = await httpRequest(
    "GET",
    `${CLIENTES_ENDPOINT}/${encodeURIComponent(clienteId)}`,
    null,
    {
      timeout: number(options.timeout, CLIENTES_DETAIL_TIMEOUT),
      source: cleanText(options.source, "views.clientes.api.detail"),
    }
  );

  const detail = normalizeDetailResponse(response);

  if (!detail || !getClienteStableId(detail)) {
    throw createContractError(
      "CLIENTE_DETAIL_INVALID_RESPONSE",
      "El backend no devolvió un cliente válido.",
      502
    );
  }

  upsertClienteStore(detail);
  return detail;
}

export async function getClienteById(id = "", options = {}) {
  const cached = findClienteById(clientesStore, id);

  if (cached && options.force !== true) {
    return cached;
  }

  return getClienteByIdRequest(id, options);
}

export const fetchClienteById = getClienteById;
export const fetchClienteDetail = getClienteById;
export const loadClienteDetail = getClienteByIdRequest;
export const getCliente = getClienteById;

/* =========================================================
   CREATE CONTRACT
========================================================= */

function buildCreateClienteBody(payload = {}) {
  const source = safeObject(payload);
  const contacto = safeObject(source.contacto);
  const direccion = safeObject(source.direccion);

  const userId = cleanText(
    first(source.userId, source.targetUserId, source.usuarioId, ""),
    ""
  );

  const tipo = normalizeClienteType(
    first(source.tipo, source.clienteTipo, source.segmento, source.type, "")
  );

  const nombreFiscal = cleanText(
    first(
      source.nombreFiscal,
      source.razonSocial,
      source.businessName,
      source.companyName,
      source.displayName,
      source.name,
      ""
    ),
    ""
  ).slice(0, 150);

  const body = {
    userId,
    tipo,
    nombreFiscal,
    nif: cleanText(first(source.nif, source.cif, source.taxId, source.vatNumber, ""), "")
      .toUpperCase()
      .slice(0, 20),

    calle: cleanText(first(source.calle, direccion.calle, direccion.street, ""), "")
      .slice(0, 150),
    cp: cleanText(first(source.cp, source.postalCode, direccion.cp, direccion.postalCode, ""), "")
      .slice(0, 10),
    ciudad: cleanText(first(source.ciudad, source.city, direccion.ciudad, direccion.city, ""), "")
      .slice(0, 100),
    provincia: cleanText(first(source.provincia, source.province, direccion.provincia, direccion.province, ""), "")
      .slice(0, 100),
    pais: cleanText(first(source.pais, source.country, direccion.pais, direccion.country, "España"), "España")
      .slice(0, 100),

    contactoNombre: cleanText(
      first(
        source.contactoNombre,
        source.nombreContacto,
        contacto.nombre,
        contacto.name,
        nombreFiscal,
        ""
      ),
      nombreFiscal
    ).slice(0, 150),

    contactoEmail: firstEmail(
      source.contactoEmail,
      source.email,
      contacto.email,
      source.targetUserEmail,
      ""
    ).slice(0, 150),

    contactoPhone: cleanText(
      first(
        source.contactoPhone,
        source.phone,
        source.telefono,
        contacto.phone,
        contacto.telefono,
        source.targetUserPhone,
        ""
      ),
      ""
    ).slice(0, 30),
  };

  if (!body.userId) {
    throw createContractError(
      "CLIENTE_USER_ID_REQUIRED",
      "Selecciona un usuario real antes de crear el cliente."
    );
  }

  if (!body.tipo) {
    throw createContractError(
      "CLIENTE_TYPE_INVALID",
      "El tipo de cliente debe ser particular o empresa."
    );
  }

  if (!body.nombreFiscal) {
    throw createContractError(
      "CLIENTE_FISCAL_NAME_REQUIRED",
      "El nombre fiscal es obligatorio."
    );
  }

  return body;
}

export async function createCliente(payload = {}, options = {}) {
  const body = buildCreateClienteBody(payload);

  const response = await httpRequest(
    "POST",
    CLIENTES_ENDPOINT,
    body,
    {
      timeout: number(options.timeout, CLIENTES_MUTATION_TIMEOUT),
      source: cleanText(options.source, "views.clientes.api.create"),
    }
  );

  const ack = safeObject(response);

  if (ack.ok === false) {
    throw createContractError(
      "CLIENTE_CREATE_REJECTED",
      safeError(response, "El backend rechazó la creación del cliente."),
      number(response?.status, 400)
    );
  }

  const clienteId = cleanText(
    first(ack.clienteId, ack.id, ack.data?.clienteId, ack.data?.id, ""),
    ""
  );

  if (!clienteId) {
    throw createContractError(
      "CLIENTE_CREATE_INVALID_RESPONSE",
      "El backend no devolvió el identificador del cliente creado.",
      502
    );
  }

  /*
    POST /api/clientes devuelve un ACK mínimo:
    { ok, clienteId, userId, synced }.

    No lo insertamos en store como si fuese el detalle completo.
    El controlador puede pedir GET /:id y después refrescar el listado.
  */
  invalidateReadCache();

  return {
    ...ack,
    ok: true,
    clienteId,
    id: clienteId,
    userId: cleanText(first(ack.userId, body.userId), body.userId),
    synced: ack.synced === true,
  };
}

export const createClienteRequest = createCliente;

/* =========================================================
   UNSUPPORTED MUTATIONS
========================================================= */

function unsupportedMutation(method = "PATCH") {
  const verb = cleanText(method, "PATCH").toUpperCase();

  return createContractError(
    `CLIENTES_${verb}_NOT_SUPPORTED`,
    `${verb} /api/clientes/:id no forma parte del contrato productivo actual.`,
    405
  );
}

/*
  Se mantienen los exports para no romper imports antiguos, pero fallan
  antes de hacer red. Nunca se convierte PATCH en POST ni PUT en PATCH.
*/
export async function updateCliente() {
  throw unsupportedMutation("PATCH");
}

export const updateClienteRequest = updateCliente;

export async function patchCliente() {
  throw unsupportedMutation("PATCH");
}

export async function putCliente() {
  throw unsupportedMutation("PUT");
}

export async function deleteCliente() {
  throw unsupportedMutation("DELETE");
}

export const deleteClienteRequest = deleteCliente;

/* =========================================================
   STORE / SNAPSHOT
========================================================= */

export function getClienteByIdStore(id = "") {
  return findClienteById(clientesStore, id);
}

export function getClientesStoreSnapshot() {
  const items = [...clientesState.items];

  return {
    version: CLIENTES_API_VERSION,
    items,
    clientes: items,
    clients: items,
    customers: items,
    rows: items,
    store: [...clientesStore],
    remoteCount: clientesState.remoteCount,
    total: clientesState.remoteCount,
    totalCount: clientesState.remoteCount,
    count: items.length,
    loading: clientesState.loading,
    refreshing: clientesState.refreshing,
    loaded: clientesState.loaded,
    hydrated: clientesState.hydrated,
    error: clientesState.error,
    lastSyncAt: clientesState.lastSyncAt,
    stats: computeClientesStats(items),
  };
}

export function getClientesStateSnapshot() {
  return getClientesStoreSnapshot();
}

export function getClientesApiSnapshot() {
  const snapshot = getClientesStoreSnapshot();
  const lastSyncAt = number(clientesState.lastSyncAt, 0);
  const ageMs = lastSyncAt
    ? Math.max(0, Date.now() - lastSyncAt)
    : Number.POSITIVE_INFINITY;

  return {
    ...snapshot,
    endpoint: CLIENTES_ENDPOINT,
    cacheAgeMs: ageMs,
    cached: Boolean(clientesState.loaded || clientesState.hydrated || clientesState.items.length),
    lastLoadedAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    inFlight: Boolean(clientesState.inflightLoad),
    lastError: clientesState.error
      ? { message: clientesState.error, code: "CLIENTES_ERROR" }
      : null,
    backendContract: Object.freeze({
      list: "GET /api/clientes",
      detail: "GET /api/clientes/:id",
      create: "POST /api/clientes",
      update: false,
      delete: false,
      pagination: false,
    }),
    safeguards: Object.freeze({
      singleHttpLayer: true,
      noMethodMasquerading: true,
      noFakeCreateDetail: true,
      createPayloadWhitelisted: true,
      listUsesSingleRequest: true,
    }),
  };
}

export async function loadClientesStats() {
  return computeClientesStats(clientesState.items);
}

export function getState() {
  return getClientesStoreSnapshot();
}

export function getSnapshot() {
  return getClientesApiSnapshot();
}

export const getDebugSnapshot = getClientesApiSnapshot;

export function getItems() {
  return [...clientesState.items];
}

export function getClientesCount() {
  return clientesState.items.length;
}

export function hasClientes() {
  return getClientesCount() > 0;
}

export function clearClientesCache() {
  nextLoadToken();

  clientesState.items = [];
  clientesState.remoteCount = 0;
  clientesState.loading = false;
  clientesState.refreshing = false;
  clientesState.loaded = false;
  clientesState.hydrated = false;
  clientesState.error = "";
  clientesState.lastSyncAt = 0;
  clientesState.inflightLoad = null;
  clientesStore = [];

  removeCachePayload();
  return true;
}

export {
  clientesState,
  clientesStore,

  setLoading,
  setRefreshing,
  setError,
  clearError,
  setItems,
  setRemoteCount,
  setLastSyncAt,
  touchLastSyncAt,
  setLoaded,
  setHydrated,

  replaceClientesStore,
  upsertClienteStore,
  removeClienteStore,

  normalizeClienteModel,
  normalizeClientesCollection,
  dedupeClientes,
  findClienteById,
  filterClientes,
  computeClientesStats,
  statusBucket,
  getClienteStableId,
};

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default Object.freeze({
  version: CLIENTES_API_VERSION,
  endpoint: CLIENTES_ENDPOINT,

  loadClientes,
  fetchClientes,
  listClientes,
  getClientes,
  refreshClientes,
  fetchClientesRequest,
  hydrateClientesFromCache,

  getClienteById,
  getClienteByIdRequest,
  fetchClienteById,
  fetchClienteDetail,
  loadClienteDetail,
  getCliente,

  createCliente,
  createClienteRequest,

  updateCliente,
  updateClienteRequest,
  patchCliente,
  putCliente,
  deleteCliente,
  deleteClienteRequest,

  getClienteByIdStore,
  getClientesStoreSnapshot,
  getClientesStateSnapshot,
  getClientesApiSnapshot,
  getState,
  getSnapshot,
  getDebugSnapshot,
  getItems,
  getClientesCount,
  hasClientes,
  clearClientesCache,

  normalizeClienteModel,
  normalizeClientesCollection,
  dedupeClientes,
  findClienteById,
  filterClientes,
  computeClientesStats,
  loadClientesStats,
  statusBucket,
});

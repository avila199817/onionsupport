/* =========================================================
   Onion Support - Clientes API
   Archivo: /src/views/clientes/clientes.api.js

   PRODUCTIVO · 1:1 INCIDENCIAS · HTTP ÚNICO · 10/10

   Contrato productivo:
   - Centraliza TODAS las llamadas HTTP de Clientes.
   - Adaptador frontend para /api/clientes.
   - Sin window.fetch propio.
   - Sin AppCore obligatorio.
   - Sin DOM, Router, Store externo ni módulos fantasma.
   - Listado completo con continuation token.
   - Cache interno en memoria + localStorage opcional.
   - Dedupe de peticiones concurrentes.
   - Protección anti-race soft.
   - No aplanar arrays en first(): conserva items/rows/clientes.
   - Compatible 1:1 con index.js y template.js de Clientes.
   - API pública alineada con incidencias.api.js:
     hydrateClientesFromCache, listClientes, loadClientes,
     loadClienteDetail, createCliente, updateCliente, deleteCliente,
     computeClientesStats, getClientesApiSnapshot.
========================================================= */

import Http from "../../core/http.js";

/* =========================================================
   META / CONFIG
========================================================= */

export const CLIENTES_API_VERSION =
  "clientes.api.incidencias-aligned.v2.http-single.no-array-flatten";

export const CLIENTES_ENDPOINT = "/api/clientes";
export const CLIENTES_FETCH_LIMIT = 250;
export const CLIENTES_MAX_LIMIT = 500;
export const CLIENTES_MAX_PAGES = 20;
export const CLIENTES_CACHE_KEY = "onion.support.clientes.api.cache.v2";
export const CLIENTES_CACHE_TTL_MS = 60_000;

export const CLIENTES_TIMEOUT = 15_000;
export const CLIENTES_DETAIL_TIMEOUT = 25_000;
export const CLIENTES_MUTATION_TIMEOUT = 25_000;
export const CLIENTES_LIST_LIMIT = CLIENTES_FETCH_LIMIT;

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
  IMPORTANTE:
  No usar values.flat(Infinity).
  Si backend devuelve { items: [...] }, aplanar puede convertir
  el array en el primer cliente y romper el listado completo.
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

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value = 0, min = 0, max = 1) {
  return Math.min(Math.max(number(value, min), min), max);
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

function normalizeSearch(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._+\-\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   STORAGE / STATE
========================================================= */

function isStorageAvailable() {
  return isBrowser() && Boolean(window.localStorage);
}

function readCachePayload() {
  if (!isStorageAvailable()) return null;

  try {
    const raw = window.localStorage.getItem(CLIENTES_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachePayload() {
  if (!isStorageAvailable()) return false;

  try {
    const payload = {
      version: CLIENTES_API_VERSION,
      items: clientesState.items,
      remoteCount: clientesState.remoteCount,
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
  const payload = readCachePayload();
  if (!payload) return false;

  const cachedAt = Number(payload.cachedAt || payload.lastSyncAt || 0);
  const age = cachedAt ? Date.now() - cachedAt : Number.POSITIVE_INFINITY;

  if (freshOnly && age > CLIENTES_CACHE_TTL_MS) return false;

  const items = normalizeClientesCollection(payload.items);
  if (!items.length) return false;

  clientesState.items = items;
  clientesState.remoteCount = Math.max(items.length, number(payload.remoteCount, items.length));
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

  const items = safeArray(clientesState.items);
  const lastSyncAt = number(clientesState.lastSyncAt, 0);
  const ageMs = lastSyncAt ? Math.max(0, Date.now() - lastSyncAt) : Number.POSITIVE_INFINITY;
  const ttlMs = number(options.ttlMs ?? options.cacheTtlMs, CLIENTES_CACHE_TTL_MS);

  return {
    ok: Boolean(clientesState.loaded || clientesState.hydrated || items.length),
    cached: true,
    stale: !lastSyncAt || ageMs > ttlMs,
    items,
    clientes: items,
    clients: items,
    customers: items,
    rows: items,
    results: items,
    total: Math.max(number(clientesState.remoteCount, items.length), items.length),
    totalCount: Math.max(number(clientesState.remoteCount, items.length), items.length),
    remoteCount: Math.max(number(clientesState.remoteCount, items.length), items.length),
    count: items.length,
    loadedAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    lastSyncAt,
    loading: clientesState.loading,
    refreshing: clientesState.refreshing,
    error: clientesState.error,
    cache: {
      hydrated: Boolean(clientesState.hydrated || items.length),
      ageMs,
      ttlMs,
      fresh: Boolean(lastSyncAt) && ageMs <= ttlMs,
      key: CLIENTES_CACHE_KEY,
    },
  };
}

function getInflightLoad() {
  return clientesState.inflightLoad || null;
}

function setInflightLoad(task = null) {
  clientesState.inflightLoad = task || null;
  return clientesState.inflightLoad;
}

function clearInflightLoad() {
  clientesState.inflightLoad = null;
  return true;
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
  const list = dedupeClientes(normalizeClientesCollection(items));
  clientesState.items = list;
  clientesStore = list;
  clientesState.remoteCount = Math.max(list.length, number(remoteCount, clientesState.remoteCount || list.length));
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

function getClientesStore() {
  return clientesStore;
}

function replaceClientesStore(items = []) {
  clientesStore = dedupeClientes(normalizeClientesCollection(items));
  clientesState.items = clientesStore;
  clientesState.remoteCount = Math.max(clientesStore.length, clientesState.remoteCount);
  return clientesStore;
}

function upsertClienteStore(item = {}) {
  const normalized = normalizeClienteModel(item);
  const id = getClienteStableId(normalized);

  if (!id) {
    clientesStore = dedupeClientes([...clientesStore, normalized]);
    clientesState.items = clientesStore;
    return normalized;
  }

  const current = dedupeClientes(clientesStore);
  const index = current.findIndex((row) => getClienteStableId(row) === id);

  if (index >= 0) {
    current[index] = {
      ...current[index],
      ...normalized,
      raw: {
        ...safeObject(current[index]?.raw),
        ...safeObject(normalized?.raw),
      },
    };
  } else {
    current.unshift(normalized);
  }

  clientesStore = dedupeClientes(current);
  clientesState.items = clientesStore;
  clientesState.remoteCount = Math.max(clientesStore.length, clientesState.remoteCount);

  return normalized;
}

function removeClienteStore(id = "") {
  const target = cleanText(id, "").toLowerCase();
  if (!target) return false;

  const before = clientesStore.length;

  clientesStore = clientesStore.filter((item) => {
    const stableId = getClienteStableId(item).toLowerCase();
    return stableId !== target;
  });

  clientesState.items = clientesStore;
  clientesState.remoteCount = Math.max(0, clientesState.remoteCount - Math.max(0, before - clientesStore.length));

  return before !== clientesStore.length;
}

/* =========================================================
   MODEL
========================================================= */

function getRaw(item = {}) {
  return safeObject(item?.raw, {});
}

function normalizeRoleLike(value = "") {
  const role = normalizeKey(value || "");

  if (["admin", "administrator", "administrador", "owner", "root"].includes(role)) return "admin";
  if (["empresa", "company", "business", "b2b"].includes(role)) return "empresa";
  if (["particular", "persona", "individual", "b2c"].includes(role)) return "particular";

  return role || "cliente";
}

function normalizeStatusValue(value = "", source = {}) {
  const explicit = first(value, source.status, source.estado, source.state, source.accountStatus, source.clientStatus);

  if (explicit !== null && explicit !== undefined && explicit !== "") {
    const status = normalizeKey(explicit);

    if (["active", "activo", "activa", "enabled", "habilitado", "habilitada", "ok"].includes(status)) return "active";
    if (["pending", "pendiente", "new", "nuevo", "invited", "invitado", "invitada"].includes(status)) return "pending";
    if (["vip", "premium"].includes(status)) return "vip";
    if (["blocked", "bloqueado", "bloqueada", "suspended", "locked", "restricted"].includes(status)) return "blocked";
    if (["disabled", "inactive", "inactivo", "inactiva", "archived"].includes(status)) return "inactive";

    return status || "active";
  }

  if (source.vip === true || source.isVip === true || source.premium === true) return "vip";
  if (source.active === false || source.isActive === false || source.enabled === false || source.disabled === true) return "inactive";
  if (source.blocked === true) return "blocked";

  return "active";
}

function normalizeClienteModel(item = {}) {
  const raw = safeObject(item);
  const profile = safeObject(first(raw.profile, raw.cliente, raw.client, raw.customer, {}));
  const address = safeObject(first(raw.address, raw.direccion, raw.location, raw.ubicacion, profile.address, profile.direccion, {}));

  const firstName = cleanText(first(raw.firstName, raw.nombre, profile.firstName, profile.nombre), "");
  const lastName = cleanText(first(raw.lastName, raw.apellidos, profile.lastName, profile.apellidos), "");
  const composedName = [firstName, lastName].filter(Boolean).join(" ");

  const email = firstEmail(
    raw.email,
    raw.emailLower,
    raw.mail,
    raw.contactEmail,
    raw.billingEmail,
    raw.facturacionEmail,
    profile.email,
    profile.emailLower,
    profile.mail
  );

  const nif = cleanText(first(raw.nif, raw.cif, raw.taxId, raw.vat, raw.documentId, profile.nif, profile.cif), "").toUpperCase();

  const clienteId = cleanText(
    first(
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.uid,
      raw.sub,
      raw.code,
      raw.codigo,
      profile.clienteId,
      profile.clientId,
      profile.id,
      profile.uid,
      nif,
      email
    ),
    ""
  );

  const name = cleanText(
    first(
      raw.razonSocial,
      raw.businessName,
      raw.companyName,
      raw.empresa,
      raw.fullName,
      raw.displayName,
      raw.name,
      raw.nombreCompleto,
      composedName,
      raw.nombre,
      profile.razonSocial,
      profile.businessName,
      profile.companyName,
      profile.fullName,
      profile.displayName,
      profile.name,
      email,
      clienteId
    ),
    "Cliente"
  );

  const type = normalizeRoleLike(first(raw.tipo, raw.type, raw.kind, raw.segment, raw.category, profile.tipo, profile.type, "cliente"));
  const status = normalizeStatusValue(first(raw.status, raw.estado, raw.state), raw);
  const phone = cleanText(first(raw.phone, raw.telefono, raw.mobile, raw.movil, profile.phone, profile.telefono, profile.mobile), "");
  const city = cleanText(first(raw.city, raw.ciudad, raw.locationCity, address.city, address.ciudad, profile.city, profile.ciudad), "");
  const avatar = cleanText(first(raw.avatarUrl, raw.avatar, raw.photoUrl, raw.photoURL, raw.picture, raw.imageUrl, profile.avatarUrl, profile.avatar, profile.photoUrl, profile.picture), "");

  const createdAt = first(raw.createdAt, raw.created_at, raw.fechaCreacion, raw.registeredAt, raw.created, raw.lifecycle?.createdAt, raw.audit?.createdAt, null);
  const updatedAt = first(raw.updatedAt, raw.updated_at, raw.modifiedAt, raw.lastModifiedAt, raw.lastActivityAt, raw.lastInvoiceAt, raw.lastTicketAt, raw.lastContactAt, raw.lifecycle?.updatedAt, raw.audit?.updatedAt, createdAt, null);
  const lastActivityAt = first(raw.lastActivityAt, raw.lastInvoiceAt, raw.lastTicketAt, raw.lastContactAt, updatedAt, createdAt, null);

  const invoicesCount = number(first(raw.invoicesCount, raw.facturasCount, raw.invoiceCount, raw.stats?.invoicesCount, raw.stats?.facturasCount), 0);
  const ticketsCount = number(first(raw.ticketsCount, raw.incidenciasCount, raw.ticketCount, raw.stats?.ticketsCount, raw.stats?.incidenciasCount), 0);
  const totalAmount = number(first(raw.totalAmount, raw.totalImporte, raw.facturasTotal, raw.invoicesTotal, raw.amount, raw.stats?.totalAmount, raw.stats?.facturasTotal), 0);

  return {
    ...raw,
    raw,

    id: clienteId,
    _id: cleanText(first(raw._id, clienteId), clienteId),
    uid: cleanText(first(raw.uid, clienteId), clienteId),
    clienteId,
    clientId: cleanText(first(raw.clientId, raw.clienteId, clienteId), clienteId),
    customerId: cleanText(first(raw.customerId, clienteId), clienteId),

    code: cleanText(first(raw.code, raw.codigo, clienteId, nif, email), clienteId || nif || email || "CLI-SIN-ID"),
    codigo: cleanText(first(raw.codigo, raw.code, clienteId, nif, email), clienteId || nif || email || "CLI-SIN-ID"),

    fullName: name,
    displayName: name,
    name,
    nombre: cleanText(first(raw.nombre, raw.name, name), name),
    razonSocial: cleanText(first(raw.razonSocial, raw.businessName, raw.companyName, name), name),
    businessName: cleanText(first(raw.businessName, raw.razonSocial, raw.companyName, name), name),
    companyName: cleanText(first(raw.companyName, raw.businessName, raw.razonSocial, name), name),
    firstName,
    lastName,
    apellidos: lastName,

    email,
    emailLower: email,
    mail: email,
    contactEmail: cleanText(first(raw.contactEmail, email), email),
    billingEmail: cleanText(first(raw.billingEmail, raw.facturacionEmail, email), email),

    phone,
    telefono: phone,
    mobile: cleanText(first(raw.mobile, raw.movil, phone), phone),
    movil: cleanText(first(raw.movil, raw.mobile, phone), phone),

    nif,
    cif: cleanText(first(raw.cif, nif), nif),
    taxId: cleanText(first(raw.taxId, nif), nif),
    vat: cleanText(first(raw.vat, nif), nif),

    role: type,
    rol: type,
    type,
    tipo: type,
    kind: normalizeKey(first(raw.kind, type, "")),
    segment: normalizeKey(first(raw.segment, type, "")),
    category: normalizeKey(first(raw.category, type, "")),

    status,
    estado: status,
    state: status,
    active: status === "active" || status === "vip",
    isActive: status === "active" || status === "vip",
    enabled: status === "active" || status === "vip",
    blocked: status === "blocked",
    vip: status === "vip" || raw.vip === true || raw.isVip === true,
    isVip: status === "vip" || raw.vip === true || raw.isVip === true,

    city,
    ciudad: city,
    locationCity: city,
    location: {
      ...safeObject(raw.location),
      city,
      ciudad: city,
    },
    address: {
      ...address,
      city,
      ciudad: city,
    },
    direccion: {
      ...address,
      city,
      ciudad: city,
    },

    avatar,
    avatarUrl: avatar,
    photoUrl: cleanText(first(raw.photoUrl, avatar), avatar),
    picture: cleanText(first(raw.picture, avatar), avatar),
    hasAvatar: Boolean(avatar),

    createdAt,
    updatedAt,
    lastActivityAt,
    lastContactAt: first(raw.lastContactAt, lastActivityAt, null),
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
    invoicesTotal: totalAmount,

    meta: {
      ...safeObject(raw.meta),
      frontendReady: true,
      apiVersion: CLIENTES_API_VERSION,
      hasEmail: Boolean(email),
      hasPhone: Boolean(phone),
      hasCity: Boolean(city),
      hasNif: Boolean(nif),
      status,
      type,
    },
  };
}

function getClienteStableId(item = {}) {
  const raw = safeObject(item?.raw);

  return cleanText(
    first(
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item._id,
      item.uid,
      item.code,
      item.codigo,
      item.nif,
      item.cif,
      item.email,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.uid,
      raw.code,
      raw.codigo,
      raw.nif,
      raw.cif,
      raw.email,
      ""
    ),
    ""
  );
}

function getSortTimestamp(item = {}) {
  const raw = safeObject(item?.raw);

  const value = first(
    item.lastActivityAt,
    item.updatedAt,
    item.lastInvoiceAt,
    item.lastTicketAt,
    item.lastContactAt,
    item.createdAt,
    raw.lastActivityAt,
    raw.updatedAt,
    raw.lastInvoiceAt,
    raw.lastTicketAt,
    raw.lastContactAt,
    raw.createdAt,
    0
  );

  const parsedDate = Date.parse(value);
  if (Number.isFinite(parsedDate)) return parsedDate;

  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 9_999_999_999 ? numeric : numeric * 1000;

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
      map.set(id, {
        ...map.get(id),
        ...normalized,
        raw: {
          ...safeObject(map.get(id)?.raw),
          ...safeObject(normalized.raw),
        },
      });
      continue;
    }

    map.set(id, normalized);
  }

  return [...map.values()].sort(compareClientesNewestFirst);
}

function normalizeClientesCollection(items = []) {
  return dedupeClientes(safeArray(items));
}

function findClienteById(items = [], id = "") {
  const target = cleanText(id, "");
  if (!target) return null;

  const targetLower = target.toLowerCase();

  return safeArray(items).find((item = {}) => {
    const raw = safeObject(item?.raw);
    const candidates = [
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item._id,
      item.uid,
      item.code,
      item.codigo,
      item.nif,
      item.cif,
      item.email,
      raw.clienteId,
      raw.clientId,
      raw.customerId,
      raw.id,
      raw._id,
      raw.uid,
      raw.code,
      raw.codigo,
      raw.nif,
      raw.cif,
      raw.email,
    ];

    return candidates.some((candidate) => cleanText(candidate, "").toLowerCase() === targetLower);
  }) || null;
}

function statusBucket(item = {}) {
  const status = normalizeStatusValue(first(item.status, item.estado, item.state), item);

  if (status === "vip") return "vip";
  if (["pending", "pendiente", "new", "nuevo"].includes(status)) return "pending";
  if (["blocked", "inactive", "disabled", "archived", "deleted"].includes(status)) return "blocked";

  return "active";
}

function clienteSearchText(item = {}) {
  return normalizeSearch(
    [
      item.clienteId,
      item.clientId,
      item.customerId,
      item.id,
      item.code,
      item.codigo,
      item.name,
      item.nombre,
      item.razonSocial,
      item.businessName,
      item.companyName,
      item.email,
      item.phone,
      item.telefono,
      item.city,
      item.ciudad,
      item.nif,
      item.cif,
      item.type,
      item.tipo,
      item.segment,
      item.status,
      item.estado,
    ].join(" ")
  );
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
      acc.total += 1;

      const bucket = statusBucket(item);

      if (bucket === "active") acc.activeCount += 1;
      if (bucket === "pending") acc.pendingCount += 1;
      if (bucket === "blocked") acc.blockedCount += 1;
      if (bucket === "vip") acc.vipCount += 1;

      acc.invoicesCount += number(item.invoicesCount, 0);
      acc.ticketsCount += number(item.ticketsCount, 0);
      acc.totalAmount += number(item.totalAmount, 0);

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
   ENVELOPE READERS
========================================================= */

function envelopeObjects(payload = null, maxDepth = 8) {
  const output = [];
  const queue = [{ value: payload, depth: 0 }];
  const seen = new Set();

  while (queue.length) {
    const { value, depth } = queue.shift();

    if (!isObject(value) || seen.has(value) || depth > maxDepth) continue;

    seen.add(value);
    output.push(value);

    for (const key of ["data", "payload", "result", "response", "body", "value"]) {
      if (isObject(value[key])) queue.push({ value: value[key], depth: depth + 1 });
    }
  }

  return output;
}

function pickItems(payload = null) {
  if (Array.isArray(payload)) return payload;

  for (const source of envelopeObjects(payload)) {
    for (const key of [
      "items",
      "rows",
      "clients",
      "clientes",
      "customers",
      "results",
      "records",
      "docs",
      "documents",
      "list",
      "value",
    ]) {
      if (Array.isArray(source[key])) return source[key];
    }
  }

  return [];
}

function pickTotal(payload = null, fallback = 0) {
  const candidates = [];

  for (const source of envelopeObjects(payload)) {
    candidates.push(
      source.total,
      source.totalCount,
      source.remoteCount,
      source.count,
      source.pagination?.total,
      source.pagination?.totalCount,
      source.meta?.total,
      source.meta?.totalCount,
      source.pageInfo?.total,
      source.pageInfo?.totalCount
    );
  }

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return Math.max(0, number(fallback, 0));
}

function pickContinuationToken(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const token = cleanText(
      first(
        source.continuationToken,
        source.nextContinuationToken,
        source.nextToken,
        source.ct,
        source.pagination?.continuationToken,
        source.pagination?.nextContinuationToken,
        source.pagination?.nextToken,
        source.pagination?.ct,
        source.pageInfo?.continuationToken,
        source.pageInfo?.nextContinuationToken,
        source.pageInfo?.nextToken,
        source.pageInfo?.ct
      ),
      ""
    );

    if (token) return token;
  }

  return "";
}

function pickHasMore(payload = null) {
  for (const source of envelopeObjects(payload)) {
    const value = first(source.hasMore, source.more, source.pagination?.hasMore, source.pageInfo?.hasMore);

    if (value === true || value === false) return value;
    if (typeof value === "string") return ["true", "1", "yes", "si", "sí"].includes(value.toLowerCase());
  }

  return Boolean(pickContinuationToken(payload));
}

function looksLikeCliente(value = null) {
  const item = safeObject(value, null);
  if (!item) return false;

  return Boolean(
    item.clienteId ||
      item.clientId ||
      item.customerId ||
      item.id ||
      item._id ||
      item.uid ||
      item.code ||
      item.codigo ||
      item.nif ||
      item.cif ||
      item.email ||
      item.name ||
      item.nombre ||
      item.razonSocial ||
      item.businessName ||
      item.companyName
  );
}

function pickDetail(payload = null) {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload.find(looksLikeCliente) || payload[0] || null;
  if (looksLikeCliente(payload)) return payload;

  for (const source of envelopeObjects(payload)) {
    for (const key of [
      "client",
      "cliente",
      "customer",
      "item",
      "detail",
      "record",
      "resource",
      "data",
    ]) {
      if (looksLikeCliente(source[key])) return source[key];
    }
  }

  return null;
}

function mergeListResponses(responses = []) {
  const pages = safeArray(responses).filter((page) => page !== null && page !== undefined);
  const items = normalizeClientesCollection(pages.flatMap(pickItems));
  const total = Math.max(items.length, ...pages.map((page) => pickTotal(page, 0)), 0);
  const last = pages.at(-1) || {};

  return {
    ...safeObject(last),
    ok: true,
    success: true,
    total,
    totalCount: total,
    remoteCount: total,
    count: items.length,
    returned: items.length,
    items,
    clients: items,
    clientes: items,
    customers: items,
    rows: items,
    results: items,
    hasMore: pickHasMore(last),
    continuationToken: pickContinuationToken(last) || null,
    nextContinuationToken: pickContinuationToken(last) || null,
  };
}

function normalizeListResponse(response = null) {
  const items = normalizeClientesCollection(pickItems(response));
  const remoteCount = Math.max(items.length, pickTotal(response, items.length));

  return {
    ...safeObject(response),
    ok: true,
    success: true,
    total: remoteCount,
    totalCount: remoteCount,
    remoteCount,
    count: items.length,
    returned: items.length,
    items,
    clients: items,
    clientes: items,
    customers: items,
    rows: items,
    results: items,
    hasMore: pickHasMore(response),
    continuationToken: pickContinuationToken(response) || null,
    nextContinuationToken: pickContinuationToken(response) || null,
  };
}

function normalizeDetailResponse(response = null) {
  const detail = pickDetail(response);
  return detail ? normalizeClienteModel(detail) : null;
}

/* =========================================================
   HTTP
========================================================= */

function cleanQueryValue(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;

  const text = cleanText(value, "");
  return text || undefined;
}

function buildListQuery({
  limit = CLIENTES_FETCH_LIMIT,
  ct = "",
  continuationToken = "",
  includeTotal = true,
  sortBy = "updatedAt",
  sortDir = "DESC",
  search = "",
  q = "",
  filters = {},
} = {}) {
  const query = {
    limit: clamp(limit, 1, CLIENTES_MAX_LIMIT),
    includeTotal: Boolean(includeTotal),
    sortBy: cleanText(sortBy, "updatedAt"),
    sortDir: cleanText(sortDir, "DESC").toUpperCase(),
  };

  const token = cleanText(first(ct, continuationToken), "");
  const finalSearch = cleanText(first(search, q), "");

  if (token) query.ct = token;
  if (finalSearch) {
    query.search = finalSearch;
    query.q = finalSearch;
  }

  for (const [key, value] of Object.entries(safeObject(filters))) {
    const cleanKey = cleanText(key, "");
    const cleanValue = cleanQueryValue(value);

    if (!cleanKey || cleanValue === undefined) continue;
    query[cleanKey] = cleanValue;
  }

  return query;
}

async function httpRequest(method = "GET", endpoint = "", body = null, options = {}) {
  const verb = cleanText(method, "GET").toUpperCase();
  const path = cleanText(endpoint, "");

  if (!path) {
    throw new Error("CLIENTES_ENDPOINT_REQUIRED");
  }

  const timeout = number(options.timeout, 15000);
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

  if (verb === "PUT") {
    return httpRequest("PATCH", path, body, options);
  }

  if (verb === "PATCH") {
    return httpRequest("POST", path, body, options);
  }

  throw new Error(`CLIENTES_HTTP_${verb}_UNAVAILABLE`);
}

async function fetchClientesPageRequest(options = {}) {
  return httpRequest("GET", CLIENTES_ENDPOINT, null, {
    timeout: number(options.timeout, CLIENTES_TIMEOUT),
    query: buildListQuery(options),
    source: "views.clientes.api.list.page",
  });
}

/* =========================================================
   PUBLIC LIST API
========================================================= */

export async function fetchClientesRequest(options = {}) {
  hydrateStateFromCache({ freshOnly: true });

  const pages = [];
  const seenTokens = new Set();
  let continuationToken = cleanText(first(options.ct, options.continuationToken), "");
  let page = 0;

  do {
    if (continuationToken) {
      if (seenTokens.has(continuationToken)) break;
      seenTokens.add(continuationToken);
    }

    page += 1;

    const response = await fetchClientesPageRequest({
      ...options,
      ct: continuationToken,
      includeTotal: page === 1 ? options.includeTotal !== false : false,
    });

    pages.push(response);

    const nextToken = pickContinuationToken(response);
    const hasMore = pickHasMore(response);

    if (!hasMore || !nextToken || nextToken === continuationToken) break;

    continuationToken = nextToken;
  } while (page < clamp(options.maxPages || CLIENTES_MAX_PAGES, 1, CLIENTES_MAX_PAGES));

  return normalizeListResponse(mergeListResponses(pages));
}

export async function loadClientes(options = {}) {
  const activeInflight = getInflightLoad();

  if (activeInflight && !options.force) {
    return activeInflight;
  }

  const token = nextLoadToken();
  const hadItems = clientesState.items.length > 0;

  setLoading(!hadItems);
  setRefreshing(Boolean(hadItems));
  clearError();

  const task = fetchClientesRequest(options)
    .then((response) => {
      if (!isActiveLoadToken(token)) {
        return getClientesStoreSnapshot();
      }

      const items = setItems(response.items, {
        remoteCount: response.remoteCount || response.totalCount || response.total,
      });

      setRemoteCount(response.remoteCount || response.totalCount || response.total || items.length);
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
        total: clientesState.remoteCount,
        totalCount: clientesState.remoteCount,
        remoteCount: clientesState.remoteCount,
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
        clearInflightLoad();
      }
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
  if (!clienteId) throw new Error("CLIENTE_ID_REQUIRED");

  const response = await httpRequest(
    "GET",
    `${CLIENTES_ENDPOINT}/${encodeURIComponent(clienteId)}`,
    null,
    {
      timeout: number(options.timeout, CLIENTES_DETAIL_TIMEOUT),
      source: "views.clientes.api.detail",
    }
  );

  const detail = normalizeDetailResponse(response);

  if (!detail) {
    throw new Error("CLIENTE_DETAIL_INVALID_RESPONSE");
  }

  upsertClienteStore(detail);

  return detail;
}

export async function getClienteById(id = "", options = {}) {
  const cached = getClienteByIdStore(id);

  if (cached && !options.force) {
    return cached;
  }

  return getClienteByIdRequest(id, options);
}

export const fetchClienteById = getClienteById;
export const fetchClienteDetail = getClienteById;
export const loadClienteDetail = getClienteByIdRequest;
export const getCliente = getClienteById;

/* =========================================================
   MUTATIONS
========================================================= */

function normalizeMutationPayload(payload = {}) {
  const current = normalizeClienteModel(payload);

  const output = {
    ...safeObject(payload),

    clienteId: current.clienteId,
    clientId: current.clientId,
    customerId: current.customerId,

    name: current.name,
    nombre: current.nombre,
    displayName: current.displayName,
    fullName: current.fullName,
    razonSocial: current.razonSocial,

    email: current.email,
    emailLower: current.emailLower,
    mail: current.mail,

    phone: current.phone,
    telefono: current.telefono,
    mobile: current.mobile,

    nif: current.nif,
    cif: current.cif,
    taxId: current.taxId,

    type: current.type,
    tipo: current.tipo,
    role: current.role,
    rol: current.rol,

    status: current.status,
    estado: current.estado,
    active: current.active,
    enabled: current.enabled,

    city: current.city,
    ciudad: current.ciudad,
    address: current.address,
    direccion: current.direccion,

    source: cleanText(payload.source, "admin_panel"),
    origen: cleanText(payload.origen, "admin_panel"),
    updatedFrom: cleanText(payload.updatedFrom, "clientes_admin"),
  };

  for (const key of Object.keys(output)) {
    if (output[key] === undefined) delete output[key];
  }

  return output;
}

export async function createCliente(payload = {}, options = {}) {
  const body = normalizeMutationPayload({
    ...payload,
    createdFrom: first(payload.createdFrom, "clientes_create_admin"),
  });

  const response = await httpRequest("POST", CLIENTES_ENDPOINT, body, {
    timeout: number(options.timeout, CLIENTES_MUTATION_TIMEOUT),
    source: "views.clientes.api.create",
  });

  const detail = normalizeDetailResponse(response) || normalizeClienteModel(response?.data || response?.payload || response);

  if (detail && getClienteStableId(detail)) {
    upsertClienteStore(detail);
    touchLastSyncAt();
    writeCachePayload();
  }

  return detail || response;
}

export const createClienteRequest = createCliente;

export async function updateCliente(id = "", payload = {}, options = {}) {
  const clienteId = cleanText(first(id, payload.id, payload.clienteId, payload.clientId), "");
  if (!clienteId) throw new Error("CLIENTE_ID_REQUIRED");

  const body = normalizeMutationPayload(payload);

  const response = await httpRequest(
    first(options.method, "PATCH"),
    `${CLIENTES_ENDPOINT}/${encodeURIComponent(clienteId)}`,
    body,
    {
      timeout: number(options.timeout, CLIENTES_MUTATION_TIMEOUT),
      source: "views.clientes.api.update",
    }
  );

  const detail = normalizeDetailResponse(response) || normalizeClienteModel(response?.data || response?.payload || response);

  if (detail && getClienteStableId(detail)) {
    upsertClienteStore(detail);
    touchLastSyncAt();
    writeCachePayload();
  }

  return detail || response;
}

export const updateClienteRequest = updateCliente;

export async function patchCliente(id = "", payload = {}, options = {}) {
  return updateCliente(id, payload, {
    ...options,
    method: "PATCH",
  });
}

export async function putCliente(id = "", payload = {}, options = {}) {
  return updateCliente(id, payload, {
    ...options,
    method: "PUT",
  });
}

export async function deleteCliente(id = "", options = {}) {
  const clienteId = cleanText(id, "");
  if (!clienteId) throw new Error("CLIENTE_ID_REQUIRED");

  const response = await httpRequest(
    "DELETE",
    `${CLIENTES_ENDPOINT}/${encodeURIComponent(clienteId)}`,
    null,
    {
      timeout: number(options.timeout, CLIENTES_MUTATION_TIMEOUT),
      source: "views.clientes.api.delete",
    }
  );

  removeClienteStore(clienteId);
  touchLastSyncAt();
  writeCachePayload();

  return {
    ...safeObject(response),
    ok: true,
    deleted: true,
    id: clienteId,
    clienteId,
  };
}

export const deleteClienteRequest = deleteCliente;

/* =========================================================
   STORE / SNAPSHOT EXPORTS
========================================================= */

export function getClienteByIdStore(id = "") {
  return findClienteById(clientesStore, id);
}

export function getClientesStoreSnapshot() {
  return {
    version: CLIENTES_API_VERSION,
    items: [...clientesState.items],
    clientes: [...clientesState.items],
    clients: [...clientesState.items],
    customers: [...clientesState.items],
    rows: [...clientesState.items],
    store: [...clientesStore],
    remoteCount: clientesState.remoteCount,
    total: clientesState.remoteCount,
    totalCount: clientesState.remoteCount,
    count: clientesState.items.length,
    loading: clientesState.loading,
    refreshing: clientesState.refreshing,
    loaded: clientesState.loaded,
    hydrated: clientesState.hydrated,
    error: clientesState.error,
    lastSyncAt: clientesState.lastSyncAt,
    stats: computeClientesStats(clientesState.items),
  };
}

export function getClientesStateSnapshot() {
  return getClientesStoreSnapshot();
}

export function getClientesApiSnapshot() {
  const snapshot = getClientesStoreSnapshot();
  const lastSyncAt = number(clientesState.lastSyncAt, 0);
  const ageMs = lastSyncAt ? Math.max(0, Date.now() - lastSyncAt) : Number.POSITIVE_INFINITY;

  return {
    ...snapshot,
    version: CLIENTES_API_VERSION,
    endpoint: CLIENTES_ENDPOINT,
    loading: clientesState.loading,
    cached: Boolean(clientesState.loaded || clientesState.hydrated || clientesState.items.length),
    lastLoadedAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
    cacheAgeMs: ageMs,
    inFlight: Boolean(clientesState.inflightLoad),
    lastError: clientesState.error ? { message: clientesState.error, code: "CLIENTES_ERROR" } : null,
    bugfix: {
      noArrayFlattenInFirst: true,
      recursiveListAliases: true,
      keepsBackendItems: true,
      continuationTokenSafe: true,
    },
    contract: {
      list: "listClientes(options) => { items, total, count, cached, stale }",
      detail: "loadClienteDetail(id) / getClienteByIdRequest(id)",
      mutations: "createCliente / updateCliente / deleteCliente",
      http: "core/http.js only",
    },
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
  clientesState.items = [];
  clientesState.remoteCount = 0;
  clientesState.loaded = false;
  clientesState.hydrated = false;
  clientesState.error = "";
  clientesState.lastSyncAt = 0;
  clientesStore = [];

  if (isStorageAvailable()) {
    try {
      window.localStorage.removeItem(CLIENTES_CACHE_KEY);
    } catch {
      // noop
    }
  }

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

export default {
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
};

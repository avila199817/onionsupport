/* =========================================================
   Onion Support - Incidencias API Request Coordinator
   Archivo: /src/views/incidencias/incidencias.api.js

   Responsabilidad:
   - mantener el API público histórico de Incidencias;
   - delegar normalización/cache/mutaciones al implementation canónico;
   - ser la única autoridad de single-flight para GET de detalle;
   - compartir un GET no-forzado aunque el caller use AbortSignal;
   - conservar la cancelación del caller que originó la request;
   - no deduplicar refreshes explícitos `force=true`;
   - resolver filtros/search de la primera página desde memoria SÓLO cuando
     el universo completo está demostrado (sin cursor y total === items).
========================================================= */

"use strict";

import * as Impl from "./incidencias.api.impl.js";

export * from "./incidencias.api.impl.js";

export const INCIDENCIAS_DETAIL_REQUEST_COORDINATOR_VERSION =
  "incidencias.detail-request.single-flight.v1";

export const INCIDENCIAS_HOT_LIST_QUERY_VERSION =
  "incidencias.list-query.complete-universe.v1";

const HOT_LIST_REVALIDATE_MIN_INTERVAL_MS = 12000;

let completeUniverse = null;
let universeRevalidationPromise = null;
let universeRevalidatedAt = 0;

function cleanKey(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function object(value = null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value = null) {
  return Array.isArray(value) ? value : [];
}

function finiteNumber(value = 0, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizedText(value = "") {
  return cleanKey(value)
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeStateKey(value = "") {
  return normalizedText(value)
    .replace(/[\s-]+/g, "_");
}

function abortError() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }

  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function followCallerAbort(promise, signal = null) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };

    const cleanup = () => {
      signal.removeEventListener?.("abort", onAbort);
    };

    signal.addEventListener?.("abort", onAbort, { once: true });

    Promise.resolve(promise).then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      }
    );
  });
}

function queryFrom(options = {}) {
  return object(object(options).query);
}

function responseCursor(response = {}) {
  const source = object(response);
  return cleanKey(
    source.nextCursor ||
    source.pagination?.nextCursor ||
    source.meta?.nextCursor ||
    ""
  );
}

function responseTotal(response = {}, fallback = 0) {
  const source = object(response);
  return Math.max(
    fallback,
    finiteNumber(
      source.total ??
      source.count ??
      source.totalCount ??
      source.pagination?.total ??
      source.meta?.total,
      fallback
    )
  );
}

function isUnfilteredFirstPageQuery(query = {}) {
  const source = object(query);
  return (
    !cleanKey(source.cursor) &&
    !cleanKey(source.q) &&
    !Object.prototype.hasOwnProperty.call(source, "closed") &&
    !cleanKey(source.priority)
  );
}

function isMainListFirstPageQuery(query = {}) {
  const source = object(query);
  const limit = Math.max(1, Math.trunc(finiteNumber(source.limit, 0)));
  const canonicalLimit = Math.max(
    1,
    Math.trunc(finiteNumber(Impl.INCIDENCIAS_LIST_LIMIT, 48))
  );

  return !cleanKey(source.cursor) && limit >= canonicalLimit;
}

function rememberCompleteUniverse(response = {}, query = {}) {
  if (!isUnfilteredFirstPageQuery(query)) return false;

  const source = object(response);
  const items = array(source.items);
  const total = responseTotal(source, items.length);
  const cursor = responseCursor(source);

  /*
     Sólo activamos el fast-path cuando no hay ninguna página pendiente.
     En un dataset paginado el servidor sigue siendo autoridad y nunca se
     simula que la primera página sea el universo completo.
  */
  if (cursor || total > items.length) {
    completeUniverse = null;
    return false;
  }

  completeUniverse = {
    items: [...items],
    total: items.length,
    response: source,
    capturedAt: Date.now(),
  };

  universeRevalidatedAt = Date.now();
  return true;
}

function invalidateCompleteUniverse() {
  completeUniverse = null;
  universeRevalidatedAt = 0;
  return true;
}

function itemStatus(item = {}) {
  const source = object(item);
  return normalizeStateKey(
    source.status ||
    source.estado ||
    source.statusKey ||
    source.lifecycle?.status ||
    "open"
  );
}

function itemPriority(item = {}) {
  const source = object(item);
  return normalizeStateKey(
    source.priority ||
    source.prioridad ||
    source.severity ||
    source.priorityKey ||
    "medium"
  );
}

function itemMatchesClosed(item = {}, closed = null) {
  if (closed !== true && closed !== false) return true;

  const status = itemStatus(item);
  const isClosed = [
    "closed",
    "resolved",
    "cerrada",
    "cerrado",
    "resuelta",
    "resuelto",
  ].includes(status);

  return closed ? isClosed : !isClosed;
}

function itemMatchesPriority(item = {}, requested = "") {
  const queryPriority = normalizeStateKey(requested);
  if (!queryPriority) return true;

  const priority = itemPriority(item);

  if (["high", "urgent", "urgente", "alta", "p1"].includes(queryPriority)) {
    return [
      "high",
      "urgent",
      "urgente",
      "alta",
      "critical",
      "critica",
      "critico",
      "p0",
      "p1",
    ].includes(priority);
  }

  return priority === queryPriority;
}

function searchHaystack(item = {}) {
  const source = object(item);
  const client = object(
    source.client ||
    source.cliente ||
    source.customer ||
    source.requester ||
    source.user
  );
  const assigned = object(
    source.assignedTo ||
    source.assignee ||
    source.assigned ||
    source.technician ||
    source.tecnico
  );

  return normalizedText([
    source.ticketId,
    source.incidenciaId,
    source.id,
    source.code,
    source.numero,
    source.ticketCode,
    source.subject,
    source.asunto,
    source.title,
    source.titulo,
    source.description,
    source.descripcion,
    source.desc,
    source.clientName,
    source.clienteNombre,
    source.customerName,
    source.userName,
    source.requesterName,
    source.clientEmail,
    source.clienteEmail,
    source.customerEmail,
    source.userEmail,
    source.requesterEmail,
    client.name,
    client.displayName,
    client.nombre,
    client.email,
    assigned.name,
    assigned.displayName,
    assigned.nombre,
    assigned.email,
    source.assignedName,
    source.assigneeName,
    source.assignedEmail,
    source.category,
    source.categoria,
    source.type,
    source.tipo,
    source.status,
    source.estado,
    source.priority,
    source.prioridad,
  ].filter((value) => value !== null && value !== undefined).join(" "));
}

function itemMatchesSearch(item = {}, search = "") {
  const needle = normalizedText(search);
  return !needle || searchHaystack(item).includes(needle);
}

function projectCompleteUniverse(query = {}) {
  if (!completeUniverse || !isMainListFirstPageQuery(query)) return null;

  const source = object(query);
  const hasClosed = Object.prototype.hasOwnProperty.call(source, "closed");
  const closed = hasClosed ? source.closed === true : null;
  const priority = cleanKey(source.priority);
  const search = cleanKey(source.q);

  const projected = completeUniverse.items.filter((item) => (
    itemMatchesClosed(item, closed) &&
    itemMatchesPriority(item, priority) &&
    itemMatchesSearch(item, search)
  ));

  const limit = Math.max(
    1,
    Math.trunc(
      finiteNumber(
        source.limit,
        Impl.INCIDENCIAS_LIST_LIMIT || 48
      )
    )
  );

  const base = object(completeUniverse.response);
  const total = projected.length;

  return {
    ...base,
    items: projected.slice(0, limit),
    total,
    count: total,
    totalCount: total,
    nextCursor: "",
    hasMore: false,
    cached: true,
    stale: false,
    localProjection: true,
    localProjectionVersion: INCIDENCIAS_HOT_LIST_QUERY_VERSION,
    pagination: {
      ...object(base.pagination),
      total,
      count: total,
      totalCount: total,
      nextCursor: "",
      hasMore: false,
    },
  };
}

function revalidateCompleteUniverse() {
  if (!completeUniverse) return null;
  if (universeRevalidationPromise) return universeRevalidationPromise;

  const age = Date.now() - universeRevalidatedAt;
  if (age < HOT_LIST_REVALIDATE_MIN_INTERVAL_MS) return null;

  universeRevalidationPromise = Promise.resolve().then(async () => {
    const response = await Impl.loadIncidenciasPage({
      query: {
        pageMode: "cursor",
        limit: Impl.INCIDENCIAS_LIST_LIMIT || 48,
      },
    });

    rememberCompleteUniverse(response, {});
    return response;
  }).catch(() => null).finally(() => {
    universeRevalidationPromise = null;
  });

  return universeRevalidationPromise;
}

/* =========================================================
   HOT LIST QUERY COORDINATOR
========================================================= */

export async function loadIncidenciasPage(options = {}) {
  const source = object(options);
  const signal = source.signal || null;
  if (signal?.aborted) throw abortError();

  const query = queryFrom(source);
  const projected = projectCompleteUniverse(query);

  if (projected) {
    void revalidateCompleteUniverse();
    return projected;
  }

  const response = await Impl.loadIncidenciasPage(options);
  rememberCompleteUniverse(response, query);
  return response;
}

/*
   Las mutaciones invalidan el universo optimista. El controller ya incorpora
   la entidad confirmada en su colección viva; la siguiente consulta completa
   vuelve a demostrar si el universo cabe en una sola página antes de reactivar
   el fast-path. Exactitud antes que una caché agresiva.
*/
async function mutateAndInvalidate(method, args = []) {
  const result = await method(...args);
  invalidateCompleteUniverse();
  return result;
}

export function clearIncidenciasCache(...args) {
  invalidateCompleteUniverse();
  return Impl.clearIncidenciasCache(...args);
}

export async function createIncidencia(...args) {
  return mutateAndInvalidate(Impl.createIncidencia, args);
}

export async function updateIncidencia(...args) {
  return mutateAndInvalidate(Impl.updateIncidencia, args);
}

export async function commentIncidencia(...args) {
  return mutateAndInvalidate(Impl.commentIncidencia, args);
}

export async function reopenIncidencia(...args) {
  return mutateAndInvalidate(Impl.reopenIncidencia, args);
}

export async function closeIncidencia(...args) {
  return mutateAndInvalidate(Impl.closeIncidencia, args);
}

export async function uploadIncidenciaAttachments(...args) {
  return mutateAndInvalidate(Impl.uploadIncidenciaAttachments, args);
}

export async function deleteIncidenciaAttachment(...args) {
  return mutateAndInvalidate(Impl.deleteIncidenciaAttachment, args);
}

/* =========================================================
   DETAIL SINGLE-FLIGHT
========================================================= */

export function createDetailRequestCoordinator(loader) {
  if (typeof loader !== "function") {
    throw new TypeError("loader debe ser una función.");
  }

  const flights = new Map();

  function request(id = "", options = {}) {
    const key = cleanKey(id);
    const force = options?.force === true || options?.forceRefresh === true;

    if (!key || force) {
      return loader(id, options);
    }

    const existing = flights.get(key);

    if (existing) {
      return followCallerAbort(existing.promise, options?.signal || null);
    }

    /*
      La primera request conserva exactamente sus opciones, incluido signal.
      En el flujo del modal esa primera request pertenece al controller, por lo
      que cerrar/cambiar de ticket sigue abortando la operación HTTP real.
    */
    const promise = Promise.resolve().then(() => loader(id, options));
    const entry = { promise };

    flights.set(key, entry);

    promise.then(
      () => {
        if (flights.get(key) === entry) flights.delete(key);
      },
      () => {
        if (flights.get(key) === entry) flights.delete(key);
      }
    );

    return followCallerAbort(promise, options?.signal || null);
  }

  function snapshot() {
    return Object.freeze({
      inFlight: flights.size,
      keys: Object.freeze([...flights.keys()]),
    });
  }

  return Object.freeze({
    request,
    snapshot,
  });
}

const detailCoordinator = createDetailRequestCoordinator(
  (id, options) => Impl.getIncidenciaByIdRequest(id, options)
);

export function getIncidenciaByIdRequest(id = "", options = {}) {
  return detailCoordinator.request(id, options);
}

export const loadIncidenciaDetail = getIncidenciaByIdRequest;

export function getIncidenciasApiSnapshot() {
  const base =
    typeof Impl.getIncidenciasApiSnapshot === "function"
      ? Impl.getIncidenciasApiSnapshot()
      : {};

  return Object.freeze({
    ...base,
    detailRequestCoordinator: Object.freeze({
      version: INCIDENCIAS_DETAIL_REQUEST_COORDINATOR_VERSION,
      ...detailCoordinator.snapshot(),
      singleFlightAcrossAbortableCallers: true,
      forcedRefreshesBypassSingleFlight: true,
    }),
    hotListQuery: Object.freeze({
      version: INCIDENCIAS_HOT_LIST_QUERY_VERSION,
      completeUniverse: Boolean(completeUniverse),
      completeUniverseItems: completeUniverse?.items?.length || 0,
      revalidationInFlight: Boolean(universeRevalidationPromise),
      exactProjectionOnlyWithoutCursor: true,
      paginatedDatasetsStayServerAuthoritative: true,
      mutationsInvalidateProjectionUniverse: true,
    }),
  });
}

export const getSnapshot = getIncidenciasApiSnapshot;
export const getDebugSnapshot = getIncidenciasApiSnapshot;

export default {
  ...(Impl.default || {}),
  loadIncidenciasPage,
  loadIncidenciaDetail,
  getIncidenciaByIdRequest,
  createIncidencia,
  updateIncidencia,
  commentIncidencia,
  reopenIncidencia,
  closeIncidencia,
  uploadIncidenciaAttachments,
  deleteIncidenciaAttachment,
  clearIncidenciasCache,
  getIncidenciasApiSnapshot,
  getSnapshot,
  getDebugSnapshot,
};

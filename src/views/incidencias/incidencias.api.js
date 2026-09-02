/* =========================================================
   Onion Support - Incidencias API Request Coordinator
   Archivo: /src/views/incidencias/incidencias.api.js

   Responsabilidad:
   - mantener el API público histórico de Incidencias;
   - delegar normalización/cache/mutaciones al implementation canónico;
   - ser la única autoridad de single-flight para GET de detalle;
   - exigir integridad materializada en Modal Details (comments/history/files);
   - forzar lectura remota sin cache para toda hidratación de detalle UI;
   - rehidratar mutaciones confirmadas antes de devolverlas al controller;
   - compartir un GET no-forzado aunque el caller use AbortSignal;
   - conservar la cancelación del caller que originó la request;
   - no deduplicar refreshes explícitos `force=true`;
   - resolver filtros/search de la primera página desde memoria SÓLO cuando
     el universo completo está demostrado (sin cursor y total === items);
   - hacer que KPI/pill/filtro Urgentes compartan exactamente la prioridad
     productiva `high` que consulta el backend.
========================================================= */

"use strict";

import * as Impl from "./incidencias.api.impl.js";
import {
  INCIDENCIAS_DETAIL_INTEGRITY_VERSION,
  createDetailIntegrityLoader,
  inspectIncidenciaDetailIntegrity,
} from "./incidencias.detail-integrity.js";
import {
  INCIDENCIAS_PRIORITY_POLICY_VERSION,
  INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY,
  isIncidenciasUrgentFacetItem,
  matchesIncidenciasPriorityQuery,
  getIncidenciasPriorityPolicySnapshot,
} from "./incidencias.priority-policy.js";

export * from "./incidencias.api.impl.js";
export {
  INCIDENCIAS_DETAIL_INTEGRITY_VERSION,
  createDetailIntegrityLoader,
  inspectIncidenciaDetailIntegrity,
} from "./incidencias.detail-integrity.js";
export {
  INCIDENCIAS_PRIORITY_POLICY_VERSION,
  INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY,
  normalizeIncidenciasPriorityKey,
  incidenciaPriorityValue,
  isIncidenciasUrgentFacetPriority,
  isIncidenciasUrgentFacetItem,
  matchesIncidenciasPriorityQuery,
  getIncidenciasPriorityPolicySnapshot,
} from "./incidencias.priority-policy.js";

export const INCIDENCIAS_DETAIL_REQUEST_COORDINATOR_VERSION =
  "incidencias.detail-request.single-flight.v2-integrity";

export const INCIDENCIAS_HOT_LIST_QUERY_VERSION =
  "incidencias.list-query.complete-universe.v2-priority-truth";

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

function isFacetCountQuery(query = {}) {
  const source = object(query);
  const limit = Math.max(1, Math.trunc(finiteNumber(source.limit, 0)));
  const hasFacetPredicate =
    Object.prototype.hasOwnProperty.call(source, "closed") ||
    Boolean(cleanKey(source.priority));

  return !cleanKey(source.cursor) && limit === 1 && hasFacetPredicate;
}

function rememberCompleteUniverse(response = {}, query = {}) {
  if (!isUnfilteredFirstPageQuery(query)) return false;

  const source = object(response);
  const items = array(source.items);
  const total = responseTotal(source, items.length);
  const cursor = responseCursor(source);
  const hasMore =
    source.hasMore === true ||
    source.pagination?.hasMore === true;

  /*
     Sólo activamos el fast-path cuando no hay ninguna página pendiente.
     El cursor/hasMore son autoridad de paginación; el total exacto ya no es
     necesario para demostrar que una primera página sin continuación contiene
     el universo completo.
  */
  if (cursor || hasMore || total > items.length) {
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
  return matchesIncidenciasPriorityQuery(item, requested);
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
  if (
    !completeUniverse ||
    !(isMainListFirstPageQuery(query) || isFacetCountQuery(query))
  ) {
    return null;
  }

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
  const authoritative = Boolean(
    source.force === true ||
    source.forceRefresh === true ||
    source.cache === false ||
    source.noCache === true
  );
  const projected = authoritative
    ? null
    : projectCompleteUniverse(query);

  if (projected) {
    void revalidateCompleteUniverse();
    return projected;
  }

  const response = await Impl.loadIncidenciasPage(options);
  rememberCompleteUniverse(response, query);
  return response;
}

/*
   Estadística canónica para la UI: el resto de agregados siguen delegados al
   implementation histórico, pero `urgent` se recalcula con la MISMA política
   de la faceta remota. De este modo el KPI nunca puede contar un documento
   que la consulta priority=high no vaya a pintar.
*/
export function computeIncidenciasStats(items = undefined) {
  const base =
    typeof Impl.computeIncidenciasStats === "function"
      ? Impl.computeIncidenciasStats(items)
      : {};

  if (!Array.isArray(items)) return base;

  return {
    ...base,
    urgent: items.reduce(
      (total, item) =>
        total + (isIncidenciasUrgentFacetItem(item) ? 1 : 0),
      0
    ),
  };
}

/* =========================================================
   DETAIL SINGLE-FLIGHT + INTEGRITY
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

/*
   El Modal Details NUNCA confía en la cache de detalle como fuente final.
   Esto es deliberado: respuestas de PATCH/comment/upload pueden ser parciales
   y el implementation histórico las normaliza con arrays vacíos. Un Ctrl+F5
   funcionaba porque borraba esa cache de memoria. Ahora la lectura pública del
   Detail fuerza GET remoto, valida colecciones y reintenta si el payload llega
   eventualmente incompleto.
*/
const detailIntegrityLoader = createDetailIntegrityLoader(
  (id, options) => detailCoordinator.request(id, options)
);

export function getIncidenciaByIdRequest(id = "", options = {}) {
  return detailIntegrityLoader.request(id, options);
}

export const loadIncidenciaDetail = getIncidenciaByIdRequest;

function ticketIdFromDetail(value = null) {
  const source = object(value);
  return cleanKey(
    source.ticketId ||
    source.incidenciaId ||
    source.id ||
    source.code ||
    source.numero ||
    ""
  );
}

function mutationSignal(args = []) {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const source = object(args[index]);
    if (source.signal) return source.signal;
  }
  return null;
}

function mutationTicketId(args = [], result = null, mode = "first") {
  if (mode === "create") return ticketIdFromDetail(result);

  if (mode === "object") {
    const source = object(args[0]);
    return cleanKey(
      source.ticketId ||
      source.incidenciaId ||
      source.id ||
      ticketIdFromDetail(result)
    );
  }

  return cleanKey(args[0] || ticketIdFromDetail(result));
}

async function authoritativeMutationResult(
  method,
  args = [],
  {
    idMode = "first",
  } = {}
) {
  const result = await method(...args);
  invalidateCompleteUniverse();

  const id = mutationTicketId(args, result, idMode);
  if (!id) return result;

  /*
     La mutación ya puede haber escrito una respuesta parcial en detailCache
     dentro del implementation. Forzamos inmediatamente la lectura completa y
     devolvemos ESA entidad al controller. Si la API de lectura está caída tras
     una mutación confirmada no convertimos una operación ya cometida en un
     falso fallo/reintento destructivo: devolvemos el resultado confirmado.
     La próxima apertura volverá a forzar integridad igualmente.
  */
  try {
    return await getIncidenciaByIdRequest(id, {
      signal: mutationSignal(args),
      integrityAttempts: 4,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return result;
  }
}

/*
   Las mutaciones invalidan el universo optimista y, cuando existe identidad
   de ticket, rehidratan el Detail desde el endpoint autoritativo. Así una
   respuesta parcial nunca se convierte en el estado visible final del modal.
*/
export function clearIncidenciasCache(...args) {
  invalidateCompleteUniverse();
  return Impl.clearIncidenciasCache(...args);
}

export async function createIncidencia(...args) {
  return authoritativeMutationResult(
    Impl.createIncidencia,
    args,
    { idMode: "create" }
  );
}

export async function updateIncidencia(...args) {
  return authoritativeMutationResult(Impl.updateIncidencia, args);
}

export async function commentIncidencia(...args) {
  return authoritativeMutationResult(Impl.commentIncidencia, args);
}

export async function reopenIncidencia(...args) {
  return authoritativeMutationResult(Impl.reopenIncidencia, args);
}

export async function closeIncidencia(...args) {
  return authoritativeMutationResult(Impl.closeIncidencia, args);
}

export async function uploadIncidenciaAttachments(...args) {
  return authoritativeMutationResult(Impl.uploadIncidenciaAttachments, args);
}

export async function deleteIncidenciaAttachment(...args) {
  return authoritativeMutationResult(
    Impl.deleteIncidenciaAttachment,
    args,
    { idMode: "object" }
  );
}

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
    detailIntegrity: Object.freeze({
      version: INCIDENCIAS_DETAIL_INTEGRITY_VERSION,
      ...detailIntegrityLoader.snapshot(),
      modalReadsAlwaysForceRemote: true,
      staleDetailCacheNeverFinalAuthority: true,
      mutationsRehydrateAuthoritativeDetail: true,
      countArrayMismatchIsIncomplete: true,
    }),
    priorityPolicy: Object.freeze({
      version: INCIDENCIAS_PRIORITY_POLICY_VERSION,
      ...getIncidenciasPriorityPolicySnapshot(),
      urgentFacetServerPriority: INCIDENCIAS_URGENT_FACET_SERVER_PRIORITY,
      statsUseCanonicalUrgentFacet: true,
      facetCountsBypassLocalProjection: true,
      forcedLoadsBypassLocalProjection: true,
    }),
    hotListQuery: Object.freeze({
      version: INCIDENCIAS_HOT_LIST_QUERY_VERSION,
      completeUniverse: Boolean(completeUniverse),
      completeUniverseItems: completeUniverse?.items?.length || 0,
      revalidationInFlight: Boolean(universeRevalidationPromise),
      exactProjectionOnlyWithoutCursor: true,
      paginatedDatasetsStayServerAuthoritative: true,
      mutationsInvalidateProjectionUniverse: true,
      priorityProjectionMatchesServerFacet: true,
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
  computeIncidenciasStats,
  createIncidencia,
  updateIncidencia,
  commentIncidencia,
  reopenIncidencia,
  closeIncidencia,
  uploadIncidenciaAttachments,
  deleteIncidenciaAttachment,
  clearIncidenciasCache,
  inspectIncidenciaDetailIntegrity,
  getIncidenciasApiSnapshot,
  getSnapshot,
  getDebugSnapshot,
};

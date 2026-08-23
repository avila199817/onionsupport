/* =========================================================
   Onion Support - Incidencias API Request Coordinator
   Archivo: /src/views/incidencias/incidencias.api.js

   Responsabilidad:
   - mantener el API público histórico de Incidencias;
   - delegar normalización/cache/mutaciones al implementation canónico;
   - ser la única autoridad de single-flight para GET de detalle;
   - compartir un GET no-forzado aunque el caller use AbortSignal;
   - conservar la cancelación del caller que originó la request;
   - no deduplicar refreshes explícitos `force=true`.

   Motivo:
   el controller abre el modal desde el item local y arranca inmediatamente
   la hidratación abortable; el enhancement progresivo observa ese mismo modal
   en el siguiente frame. Ambos deben compartir la petición ya en vuelo, no
   crear dos GET /api/tickets/:id.
========================================================= */

"use strict";

import * as Impl from "./incidencias.api.impl.js";

export * from "./incidencias.api.impl.js";

export const INCIDENCIAS_DETAIL_REQUEST_COORDINATOR_VERSION =
  "incidencias.detail-request.single-flight.v1";

function cleanKey(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

    return promise;
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
  });
}

export const getSnapshot = getIncidenciasApiSnapshot;
export const getDebugSnapshot = getIncidenciasApiSnapshot;

export default {
  ...(Impl.default || {}),
  loadIncidenciaDetail,
  getIncidenciaByIdRequest,
  getIncidenciasApiSnapshot,
  getSnapshot,
  getDebugSnapshot,
};

/* =========================================================
   Onion Support - Incidencias Detail Integrity
   Archivo: /src/views/incidencias/incidencias.detail-integrity.js

   AUTORIDAD DE INTEGRIDAD · 2026-09-01

   Objetivo:
   - un Modal Details nunca acepta como "detalle completo" una respuesta
     que anuncia comentarios/historial/adjuntos pero no materializa sus arrays;
   - las lecturas del modal siempre fuerzan verdad remota (sin cache stale);
   - respuestas eventualmente incompletas se reintentan de forma acotada;
   - AbortSignal conserva autoridad total para cerrar/cambiar de ticket.
========================================================= */

"use strict";

export const INCIDENCIAS_DETAIL_INTEGRITY_VERSION =
  "incidencias.detail-integrity.authoritative.v1";

export const INCIDENCIAS_DETAIL_INTEGRITY_RETRY_DELAYS_MS =
  Object.freeze([0, 180, 650, 1600]);

function clean(value = "") {
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

function finite(value = null) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function maxKnown(...values) {
  const known = values
    .map(finite)
    .filter((value) => value !== null);
  return known.length ? Math.max(...known) : null;
}

function firstArray(...values) {
  let firstEmpty = null;

  for (const value of values) {
    if (!Array.isArray(value)) continue;
    if (value.length) return value;
    if (firstEmpty === null) firstEmpty = value;
  }

  return firstEmpty || [];
}

function ticketId(detail = {}) {
  const source = object(detail);
  return clean(
    source.ticketId ||
    source.incidenciaId ||
    source.id ||
    source.code ||
    source.numero ||
    ""
  );
}

function timelineSplit(detail = {}) {
  const source = object(detail);
  const raw = object(source.raw);
  const timeline = firstArray(source.timeline, raw.timeline);

  let comments = 0;
  let history = 0;

  for (const entry of timeline) {
    const item = object(entry);
    const kind = clean(
      item.kind || item.type || item.action || item.event || ""
    ).toLocaleLowerCase("es-ES");

    if (kind === "comment" || kind === "comentario") comments += 1;
    else history += 1;
  }

  return Object.freeze({ comments, history, total: timeline.length });
}

function collectionState({
  detail,
  key,
  aliases,
  countAliases,
  timelineActual = 0,
} = {}) {
  const source = object(detail);
  const raw = object(source.raw);
  const meta = object(source.meta);
  const windowMeta = object(meta[key]);

  const directArrays = aliases.map((alias) => source[alias]);
  const rawArrays = aliases.map((alias) => raw[alias]);
  const materialized = firstArray(...directArrays, ...rawArrays);
  const actual = Math.max(materialized.length, timelineActual);

  const directCounts = countAliases.map((alias) => source[alias]);
  const rawCounts = countAliases.map((alias) => raw[alias]);

  const total = maxKnown(
    actual,
    ...directCounts,
    ...rawCounts,
    windowMeta.total,
    meta[`${key}Count`]
  );

  const declaredReturned = maxKnown(
    windowMeta.returned,
    windowMeta.count
  );

  const expectedReturned = declaredReturned !== null
    ? declaredReturned
    : (total !== null && total > 0 ? 1 : 0);

  const missingDeclaredRows =
    declaredReturned !== null && actual < declaredReturned;

  const announcedButEmpty =
    (total || 0) > 0 && actual === 0;

  const incomplete = Boolean(
    missingDeclaredRows ||
    announcedButEmpty
  );

  return Object.freeze({
    key,
    actual,
    total: total ?? actual,
    declaredReturned,
    expectedReturned,
    incomplete,
    truncated: windowMeta.truncated === true || windowMeta.hasMore === true,
  });
}

export function inspectIncidenciaDetailIntegrity(detail = null) {
  const source = object(detail);
  const split = timelineSplit(source);

  const comments = collectionState({
    detail: source,
    key: "comments",
    aliases: ["comments", "notes", "messages"],
    countAliases: ["commentsCount", "commentCount", "notesCount", "messagesCount"],
    timelineActual: split.comments,
  });

  const history = collectionState({
    detail: source,
    key: "history",
    aliases: ["history", "events"],
    countAliases: ["historyCount", "eventsCount", "eventCount"],
    timelineActual: split.history,
  });

  const attachments = collectionState({
    detail: source,
    key: "attachments",
    aliases: ["attachments", "files", "adjuntos"],
    countAliases: [
      "attachmentsCount",
      "attachmentCount",
      "filesCount",
      "adjuntosCount",
    ],
  });

  const id = ticketId(source);
  const collections = Object.freeze({ comments, history, attachments });
  const incompleteCollections = Object.freeze(
    Object.values(collections)
      .filter((entry) => entry.incomplete)
      .map((entry) => entry.key)
  );

  return Object.freeze({
    version: INCIDENCIAS_DETAIL_INTEGRITY_VERSION,
    ticketId: id,
    hasTicketIdentity: Boolean(id),
    complete: Boolean(id) && incompleteCollections.length === 0,
    incompleteCollections,
    collections,
    timeline: split,
  });
}

function abortError() {
  if (typeof DOMException !== "undefined") {
    return new DOMException("The operation was aborted.", "AbortError");
  }
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

function isAbort(error = null) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function wait(ms = 0, signal = null) {
  const delay = Math.max(0, Number(ms) || 0);
  if (!delay) {
    if (signal?.aborted) return Promise.reject(abortError());
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delay);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(abortError());
    };

    const cleanup = () => {
      signal?.removeEventListener?.("abort", onAbort);
    };

    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

export function createDetailIntegrityLoader(
  loader,
  {
    retryDelays = INCIDENCIAS_DETAIL_INTEGRITY_RETRY_DELAYS_MS,
    inspect = inspectIncidenciaDetailIntegrity,
  } = {}
) {
  if (typeof loader !== "function") {
    throw new TypeError("loader debe ser una función.");
  }

  const delays = array(retryDelays).length
    ? array(retryDelays).map((value) => Math.max(0, Number(value) || 0))
    : [0];

  let requests = 0;
  let retries = 0;
  let incompleteResponses = 0;
  let failures = 0;
  let lastIncompleteCollections = [];

  async function request(id = "", options = {}) {
    const key = clean(id);
    const signal = options?.signal || null;
    const requestedAttempts = Math.trunc(Number(options?.integrityAttempts) || delays.length);
    const attempts = Math.max(1, Math.min(8, requestedAttempts));
    let lastError = null;
    let lastIntegrity = null;

    if (!key) {
      const error = new Error("INCIDENCIA_ID_REQUIRED");
      error.code = "INCIDENCIA_ID_REQUIRED";
      throw error;
    }

    requests += 1;

    for (let index = 0; index < attempts; index += 1) {
      if (signal?.aborted) throw abortError();

      if (index > 0) {
        retries += 1;
        const delay = delays[Math.min(index, delays.length - 1)] || 0;
        await wait(delay, signal);
      }

      try {
        const detail = await loader(key, {
          ...object(options),
          force: true,
          forceRefresh: true,
          cache: false,
          noCache: true,
          signal,
        });

        const integrity = inspect(detail);
        lastIntegrity = integrity;

        if (integrity.complete) {
          lastIncompleteCollections = [];
          return detail;
        }

        incompleteResponses += 1;
        lastIncompleteCollections = [...integrity.incompleteCollections];
        lastError = null;
      } catch (error) {
        if (isAbort(error)) throw error;
        lastError = error;
      }
    }

    failures += 1;

    if (lastError) throw lastError;

    const error = new Error(
      `El backend devolvió un detalle incompleto para ${key}.`
    );
    error.code = "INCIDENCIA_DETAIL_INCOMPLETE";
    error.integrity = lastIntegrity;
    throw error;
  }

  function snapshot() {
    return Object.freeze({
      version: INCIDENCIAS_DETAIL_INTEGRITY_VERSION,
      requests,
      retries,
      incompleteResponses,
      failures,
      lastIncompleteCollections: Object.freeze([...lastIncompleteCollections]),
      forcedNoCache: true,
      retriesIncompletePayloads: true,
      abortAware: true,
    });
  }

  return Object.freeze({ request, snapshot });
}

export default {
  INCIDENCIAS_DETAIL_INTEGRITY_VERSION,
  INCIDENCIAS_DETAIL_INTEGRITY_RETRY_DELAYS_MS,
  inspectIncidenciaDetailIntegrity,
  createDetailIntegrityLoader,
};

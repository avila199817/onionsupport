/* =========================================================
   Onion Support - Agenda API
   Archivo: /src/views/agenda/agenda.api.js

   Frontera HTTP de la Agenda. Sin estado de vista, sin DOM.

   - Una sola autoridad de transporte: `core/http.js`.
   - La base de datos es la fuente de verdad: aquí no hay `localStorage`,
     ni array en memoria que sustituya a la persistencia, ni calendario
     externo. La caché de rangos es sólo un recuerdo de la última respuesta
     del servidor y se invalida en cuanto algo cambia.
   - La búsqueda de usuarios usa el MISMO endpoint autorizado que el alta de
     Incidencias (`/api/users`), no una lista propia.
   - Los mensajes de error los decide la autoridad de presentación
     (`core/error-rules.js`) sobre los códigos que publica el backend.

   Consumidor nuevo de `errorMessage`, así que declara su orden aquí, donde
   se revisa en el diff y donde `tools/error-extraction-contract.mjs` lo
   comprueba contra lo que este módulo llama de verdad:

   @error-message-order payloadFirst · los códigos de `router/citas` traen
   su propia explicación —qué hora no existe, qué campos no se pueden fijar,
   qué versión falta—, así que manda el texto del backend sobre el del Error
   envoltorio.
========================================================= */

import Http from "../../core/http.js";
import { presentError } from "../../core/error-rules.js";
import { errorMessage, ERROR_MESSAGE_POLICIES } from "../../core/errors.js";
import { cleanText } from "../../core/presentation-text.js";
import { userNameFromIdentity } from "../../core/user-identity.js";
import { safeObject } from "../../core/objects.js";

import { AGENDA_TIME_ZONE, isDateKey } from "./agenda.dates.js";

export const AGENDA_API_VERSION = "agenda.api.v1";

export const CITAS_ENDPOINT = "/api/citas";
/* Mismo endpoint autorizado que consume el alta de Incidencias. */
export const USERS_SEARCH_ENDPOINT = "/api/users";
export const USERS_SEARCH_MIN_LENGTH = 2;
export const USERS_SEARCH_LIMIT = 8;

const REQUEST_TIMEOUT_MS = 20000;

/* =========================================================
   PRESENTACIÓN DE ERRORES
========================================================= */

/*
  Reglas ordenadas sobre los códigos que publica `router/citas`. Ningún
  texto técnico llega al usuario, y un 5xx no expone el detalle interno.
*/
export const AGENDA_ERROR_RULES = Object.freeze([
  {
    offline: true,
    message: "No hay conexión con el servidor. Comprueba tu red y vuelve a intentarlo.",
  },
  {
    codes: ["CITA_VERSION_CONFLICTO"],
    message:
      "La cita ha cambiado mientras la editabas. Recarga la agenda y vuelve a intentarlo.",
  },
  {
    codes: ["CITA_VERSION_REQUERIDA"],
    message: "No se conoce la versión de la cita. Recarga la agenda y vuelve a intentarlo.",
  },
  {
    codes: ["CITAS_ALMACENAMIENTO_NO_DISPONIBLE"],
    message:
      "La agenda todavía no está disponible. Avisa al administrador del sistema.",
  },
  {
    codes: ["CITA_PERMISO_ADMIN_REQUERIDO", "CITA_ACCESO_DENEGADO"],
    message: "No tienes permiso para gestionar citas.",
  },
  {
    codes: ["CITA_NO_ENCONTRADA"],
    message: "No se ha encontrado la cita.",
  },
  {
    codes: ["CITA_AUTENTICACION_REQUERIDA"],
    message: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
  },
  {
    /* Los errores de validación del dominio ya traen su explicación: la
       extrae la autoridad de errores, con la política que da prioridad al
       texto del backend sobre el del Error envoltorio. */
    codeIncludes: ["CITA_"],
    message: ({ error }) =>
      errorMessage(error, "No se ha podido completar la operación.", ERROR_MESSAGE_POLICIES.payloadFirst),
  },
  { minStatus: 500, message: "El servidor no ha podido completar la operación." },
]);

export function agendaErrorMessage(error, fallback = "No se ha podido completar la operación.") {
  return presentError(error, AGENDA_ERROR_RULES, fallback);
}

/* =========================================================
   NORMALIZACIÓN
========================================================= */

export function normalizeCita(raw = {}) {
  const source = safeObject(raw);
  const notificacion = safeObject(source.notificacion);

  return Object.freeze({
    id: cleanText(source.id, ""),
    fechaLocal: cleanText(source.fechaLocal, ""),
    horaLocal: cleanText(source.horaLocal, ""),
    zona: cleanText(source.zona, AGENDA_TIME_ZONE),
    inicioUtc: cleanText(source.inicioUtc, ""),
    asunto: cleanText(source.asunto, "Cita de soporte"),
    lugar: cleanText(source.lugar, ""),
    nota: typeof source.nota === "string" ? source.nota : "",
    estado: cleanText(source.estado, "programada"),
    canceladaEn: cleanText(source.canceladaEn, ""),
    version: Number(source.version) || 1,
    updatedAt: cleanText(source.updatedAt, ""),

    /* Sólo llegan al administrador; en el usuario quedan vacíos. */
    userId: cleanText(source.userId, ""),
    destinatarioNombre: cleanText(source.destinatarioNombre, ""),
    organizadorNombre: cleanText(source.organizadorNombre, ""),
    cancelacion: source.cancelacion ? Object.freeze({ ...safeObject(source.cancelacion) }) : null,
    etag: cleanText(source.etag, ""),
    notificacion: notificacion.estado
      ? Object.freeze({
          tipo: cleanText(notificacion.tipo, ""),
          estado: cleanText(notificacion.estado, ""),
          etiqueta: cleanText(notificacion.etiqueta, ""),
          intentos: Number(notificacion.intentos) || 0,
          versionComunicada: Number(notificacion.versionComunicada) || 0,
          motivo: cleanText(notificacion.motivo, ""),
        })
      : null,
  });
}

/* Orden estable: día, hora y después identificador. */
export function sortCitas(items = []) {
  return [...items].sort((a, b) => {
    if (a.fechaLocal !== b.fechaLocal) return a.fechaLocal < b.fechaLocal ? -1 : 1;
    if (a.horaLocal !== b.horaLocal) return a.horaLocal < b.horaLocal ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function normalizeUserResult(raw = {}) {
  const source = safeObject(raw);
  const userId = cleanText(
    source.userId || source.id || source.uid || source.sub || source.usuarioId,
    ""
  );

  return Object.freeze({
    userId,
    nombre: userNameFromIdentity(source, cleanText(source.username, "") || userId || "Usuario"),
    email: cleanText(source.email || source.emailLower || source.userEmail, ""),
    telefono: cleanText(source.phone || source.telefono, ""),
    avatarUrl: cleanText(
      source.avatarUrl || source.avatar || source.photoUrl || source.profile?.avatarUrl,
      ""
    ),
  });
}

function listFromPayload(payload = {}, keys = []) {
  const source = safeObject(payload);
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key];
    if (Array.isArray(source.data?.[key])) return source.data[key];
  }
  if (Array.isArray(source.data)) return source.data;
  if (Array.isArray(source)) return source;
  return [];
}

/* =========================================================
   CACHÉ DE RANGOS
========================================================= */

/*
  Sólo recuerda la última respuesta por (identidad, rango). No sustituye a la
  persistencia, no mezcla sesiones y se invalida entera en cuanto se crea,
  edita o cancela una cita. Una respuesta de otro rango no puede sustituir al
  rango vigente porque la clave lo incluye.
*/
const rangeCache = new Map();
let cacheIdentity = "";

function cacheKey(desde, hasta) {
  return `${desde}..${hasta}`;
}

export function setAgendaIdentity(identity = "") {
  const next = cleanText(identity, "");
  if (next === cacheIdentity) return false;
  cacheIdentity = next;
  rangeCache.clear();
  return true;
}

export function invalidateAgendaCache() {
  rangeCache.clear();
  return true;
}

export function getAgendaApiSnapshot() {
  return Object.freeze({
    version: AGENDA_API_VERSION,
    identity: cacheIdentity,
    cachedRanges: rangeCache.size,
    endpoints: Object.freeze({ citas: CITAS_ENDPOINT, users: USERS_SEARCH_ENDPOINT }),
  });
}

/* =========================================================
   CITAS
========================================================= */

function unwrap(response = {}) {
  const source = safeObject(response);
  if (source.ok === false) {
    const error = new Error(cleanText(source.message, "No se ha podido completar la operación."));
    error.data = source;
    error.code = cleanText(source.code || source.error, "");
    throw error;
  }
  return source;
}

/*
  Citas del intervalo visible. Se consulta SÓLO el rango de la rejilla,
  días adyacentes incluidos: nunca el histórico completo.
*/
export async function loadCitasRange({ desde = "", hasta = "", signal = null, force = false } = {}) {
  if (!isDateKey(desde) || !isDateKey(hasta)) {
    throw new Error("El intervalo del calendario no es válido.");
  }

  const key = cacheKey(desde, hasta);
  if (!force && rangeCache.has(key)) return rangeCache.get(key);

  const response = unwrap(
    await Http.get(CITAS_ENDPOINT, {
      query: { desde, hasta },
      timeout: REQUEST_TIMEOUT_MS,
      source: "views.agenda.citas.range",
      signal,
    })
  );

  const result = Object.freeze({
    desde,
    hasta,
    citas: Object.freeze(sortCitas(listFromPayload(response, ["citas"]).map(normalizeCita))),
    zona: cleanText(response.zona, AGENDA_TIME_ZONE),
    truncado: response.truncado === true,
    limite: Number(response.limite) || 0,
    puedeCrear: response.puedeCrear === true,
  });

  rangeCache.set(key, result);
  return result;
}

export async function loadCitaDetail(id = "", { userId = "", signal = null } = {}) {
  const citaId = cleanText(id, "");
  if (!citaId) throw new Error("No se ha encontrado la cita.");

  const response = unwrap(
    await Http.get(`${CITAS_ENDPOINT}/${encodeURIComponent(citaId)}`, {
      /* Pista de partición para ahorrar una consulta cruzada. No autoriza
         nada: el backend decide con el documento que lee. */
      query: userId ? { userId } : undefined,
      timeout: REQUEST_TIMEOUT_MS,
      source: "views.agenda.citas.detail",
      signal,
    })
  );

  return normalizeCita(response.cita);
}

/*
  Alta. `idempotencyKey` viaja en la cabecera estándar para que un doble
  envío o un reintento tras un timeout no creen dos citas.
*/
export async function createCita(payload = {}, { idempotencyKey = "", signal = null } = {}) {
  const response = unwrap(
    await Http.post(CITAS_ENDPOINT, payload, {
      timeout: REQUEST_TIMEOUT_MS,
      source: "views.agenda.citas.create",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      signal,
    })
  );

  invalidateAgendaCache();
  return Object.freeze({
    cita: normalizeCita(response.cita),
    repetida: response.repetida === true,
  });
}

export async function updateCita(id = "", payload = {}, { etag = "", userId = "", signal = null } = {}) {
  const citaId = cleanText(id, "");
  const response = unwrap(
    await Http.patch(`${CITAS_ENDPOINT}/${encodeURIComponent(citaId)}`, payload, {
      query: userId ? { userId } : undefined,
      timeout: REQUEST_TIMEOUT_MS,
      source: "views.agenda.citas.update",
      headers: etag ? { "If-Match": etag } : undefined,
      signal,
    })
  );

  invalidateAgendaCache();
  return Object.freeze({
    cita: normalizeCita(response.cita),
    cambios: Array.isArray(response.cambios) ? response.cambios : [],
  });
}

export async function cancelCita(id = "", payload = {}, { etag = "", userId = "", signal = null } = {}) {
  const citaId = cleanText(id, "");
  const response = unwrap(
    await Http.post(`${CITAS_ENDPOINT}/${encodeURIComponent(citaId)}/cancelar`, payload, {
      query: userId ? { userId } : undefined,
      timeout: REQUEST_TIMEOUT_MS,
      source: "views.agenda.citas.cancel",
      headers: etag ? { "If-Match": etag } : undefined,
      signal,
    })
  );

  invalidateAgendaCache();
  return normalizeCita(response.cita);
}

/* =========================================================
   BÚSQUEDA DE USUARIOS
========================================================= */

let usersSearchController = null;

/*
  Búsqueda autorizada de usuarios. Es el mismo endpoint y la misma forma de
  consulta que usa el alta de Incidencias; no hay una segunda lista de
  usuarios ni se crean cuentas desde aquí.

  Una respuesta tardía no puede pisar a la vigente: cada búsqueda aborta la
  anterior y el llamante compara su número de secuencia.
*/
export async function searchAgendaUsers(query = "", { limit = USERS_SEARCH_LIMIT, signal = null } = {}) {
  const q = cleanText(query, "");

  if (q.length < USERS_SEARCH_MIN_LENGTH) {
    usersSearchController?.abort?.();
    usersSearchController = null;
    return [];
  }

  let controller = null;
  if (!signal && typeof AbortController !== "undefined") {
    usersSearchController?.abort?.();
    controller = new AbortController();
    usersSearchController = controller;
  }

  try {
    const response = unwrap(
      await Http.get(USERS_SEARCH_ENDPOINT, {
        query: { q, limit: Math.max(1, Math.min(Number(limit) || USERS_SEARCH_LIMIT, 20)), includeTotal: false },
        timeout: REQUEST_TIMEOUT_MS,
        source: "views.agenda.users.search",
        signal: signal || controller?.signal,
      })
    );

    return listFromPayload(response, ["usuarios", "users", "items", "results"])
      .map(normalizeUserResult)
      .filter((user) => user.userId)
      .slice(0, limit);
  } finally {
    if (controller && usersSearchController === controller) usersSearchController = null;
  }
}

export function abortAgendaUserSearch() {
  usersSearchController?.abort?.();
  usersSearchController = null;
  return true;
}

export default {
  AGENDA_API_VERSION,
  CITAS_ENDPOINT,
  USERS_SEARCH_ENDPOINT,
  USERS_SEARCH_MIN_LENGTH,
  AGENDA_ERROR_RULES,
  agendaErrorMessage,
  normalizeCita,
  normalizeUserResult,
  sortCitas,
  setAgendaIdentity,
  invalidateAgendaCache,
  getAgendaApiSnapshot,
  loadCitasRange,
  loadCitaDetail,
  createCita,
  updateCita,
  cancelCita,
  searchAgendaUsers,
  abortAgendaUserSearch,
};

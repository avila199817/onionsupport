import { escapeHtml } from "../../core/escape-html.js";
import { createModalLifecycle, holdModalPanel, liveModalOpener, releaseModalPanel, restoreModalFocus } from "../entity-overlay/modal-lifecycle.js";
import { MODAL_SHELL_SELECTORS, createModalHost, renderModalCloseButton, renderModalContent, renderModalShell } from "../entity-overlay/modal-host.js";
/* =========================================================
   Onion Support · Incidencias Technician Profile

   PUBLIC-SAFE METRICS · FIVE-STAR READY · GLOBAL AVATAR AUTHORITY

   Contrato visual/productivo:
   - El modal presenta al técnico, no el historial privado de sus clientes.
   - Usuarios no admin pueden ver un cómputo agregado de resoluciones cuando el
     backend expone el agregado público; nunca se pintan tickets de terceros.
   - Si el backend aún no expone el agregado público, se muestra únicamente el
     total que la sesión actual puede conocer, claramente marcado como ámbito.
   - La valoración NO se calcula aquí. La resume el backend sobre la atribución
     que ya está persistida en el vínculo, y este modal la presenta con estados
     explícitos: consultando, dato, sin valoraciones, restringido, error. Un cero
     no sustituye a un vacío y un vacío no sustituye a un fallo.
   - Sin formulario de valoración en esta versión.
   - Avatar delegado al AvatarSystem global; foto del ticket/usuario.
========================================================= */

"use strict";

import "./style.css";

import {
  normalizeAvatarUserId,
  resolveAvatarPresentation,
} from "../avatar-system/identity.js";
import {
  synchronizeAvatars,
} from "../avatar-system/index.js";
import { cleanText } from "../../core/presentation-text.js";
import { safeObject, firstNonEmpty } from "../../core/objects.js";
import { ERROR_MESSAGE_POLICIES, errorMessage, errorStatus } from "../../core/errors.js";
import { finiteNumber } from "../../core/numbers.js";
import { formatDecimal } from "../../core/format.js";

export const INCIDENCIAS_TECHNICIAN_PROFILE_VERSION =
  "incidencias-technician-profile.v10-technician-rating-from-authority";

/* La escala que dibuja el modal mientras no hay respuesta. En cuanto la hay,
   manda la que declara el resumen del backend: la escala no se duplica. */
export const TECHNICIAN_RATING_MAX = 5;

/* LOS CINCO ESTADOS SON DISTINTOS ENTRE SÍ.
 *
 * Consultando no es «sin valoraciones»; «sin valoraciones» no es un cero; una
 * sesión sin permiso para el agregado no es un técnico sin opiniones; y un fallo
 * de carga no es ninguna de las anteriores. */
export const TECHNICIAN_RATING_STATES = Object.freeze({
  loading: "loading",
  value: "value",
  empty: "empty",
  restricted: "restricted",
  unresolved: "unresolved",
  error: "error",
});

const VIEW = "#view-container, [data-router-view='true']";
const LIST_TECH_BADGE =
  ".incidencias-assigned-badge[data-assigned='true']";
const DETAIL_TECHNICIAN =
  ".incidencias-modal-technician-inline[data-modal-technician='true'][data-technician-assigned='true']";
const DETAIL_TECH_CARD =
  ".incidencias-modal-technician-card[data-technician-profile-trigger='true'][data-assigned='true']";
const TECH_TRIGGER = `${LIST_TECH_BADGE}, ${DETAIL_TECH_CARD}`;
const DETAIL_ROOT = "[data-incidencias-modal-root='true']";
const MODAL_HOST = "[data-incidencias-modal-host='true']";
const ROW = "[data-ticket-row='true']";
const HOST_ID = "incidencias-technician-profile-host";
const ROOT_ID = "incidencias-technician-profile-root";
const PANEL_ID = "incidencias-technician-profile-panel";
const RETRY_RATING = "[data-technician-profile-action='retry-rating']";
const METRICS_SECTION = "[data-technician-public-metrics='true']";
const TRUSTED_BLOB_HOST = "onionassets.blob.core.windows.net";
const PUBLIC_METRIC_LIMIT = 1;


/*
  Sólo datos profesionales ya publicados por Onion Support. No contiene foto:
  el retrato del modal debe proceder del usuario/ticket o del AvatarSystem.
*/
export const CRISTIAN_PUBLIC_TECHNICIAN_PROFILE = Object.freeze({
  id: "cristian-avila",
  name: "Cristian Ávila",
  role: "Técnico informático",
  email: "cristian@onionsupport.com",
  username: "cristian",
  experienceValue: "+8",
  experienceLabel: "años de experiencia",
  clientsValue: "+300",
  clientsLabel: "clientes atendidos",
});

let mounted = false;
let mountRoot = null;
let observer = null;
let modalObserver = null;
let observedModalHost = null;
let frame = 0;
let requestSeq = 0;
let returnFocus = null;
let profileOrigin = null;
let heldPanel = null;
const profileHost = createModalHost({ id: HOST_ID, attributes: { "data-technician-profile-host": "true" } });
let incidenceApiPromise = null;
let usersApiPromise = null;
let reviewsApiPromise = null;
/* Lo que necesita un reintento del resumen: de qué apertura es y sobre qué
   técnico. Se descarta al cerrar, para que un reintento tardío no escriba en un
   perfil que ya no es el de la pantalla. */
let ratingContext = null;
const modalLifecycle = createModalLifecycle({
  getPanel: () => profileOrigin?.isConnected ? modalPanel() : null,
  onDetached: () => closeProfile({ restoreFocus: false }),
  onEscape: () => closeProfile(),
  onBackdrop: () => closeProfile(),
  bodyClasses: ['ui-detail-modal-open'],
});

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

// Missing fields may inherit a snapshot. Null/empty values are explicit clears.
function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}


const attr = (value = "") => escapeHtml(cleanText(value, ""));

function handleKey(value = "") {
  return cleanText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.@]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeName(value = "") {
  return cleanText(value, "")
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  const email = cleanText(value, "").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeAvatarUrl(value = "") {
  const raw = cleanText(value, "");
  if (!raw || raw.startsWith("//") || /[\r\n\t\\]/.test(raw)) return "";
  if (/^(javascript|data|vbscript|file):/i.test(raw)) return "";
  if (/^blob:/i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw.replace(/\/{2,}/g, "/");
  if (!/^https:\/\//i.test(raw)) return "";

  try {
    const url = new URL(raw);
    const blocked = [
      "access_token", "refresh_token", "id_token", "token", "code",
      "secret", "session", "password", "pwd", "key", "jwt",
      "authorization", "reset_token", "activation_token",
    ];
    for (const key of url.searchParams.keys()) {
      if (blocked.includes(String(key).toLowerCase())) return "";
    }
    if (
      url.searchParams.has("sig") &&
      url.hostname.toLowerCase() !== TRUSTED_BLOB_HOST
    ) return "";
    return url.href;
  } catch {
    return "";
  }
}

function nonNegativeInteger(value = null, fallback = null) {
  const parsed = finiteNumber(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function numberLabel(value = 0) {
  return formatDecimal(Number(value) || 0);
}

function ratingLabel(value = 0, max = TECHNICIAN_RATING_MAX) {
  const safe = Math.max(0, Math.min(max, Number(value) || 0));
  try {
    return new Intl.NumberFormat("es-ES", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(safe);
  } catch {
    return safe.toFixed(1).replace(".", ",");
  }
}

function technicianFromTicket(ticket = {}) {
  const raw = safeObject(ticket);
  const assignment = safeObject(raw.assignment);
  const nested = safeObject(firstNonEmpty(
    raw.assignedTo,
    raw.technician,
    raw.tecnico,
    raw.assignedTechnician,
    assignment.technician,
    assignment.assignedTo,
    {}
  ));
  const email = firstDefined(
    raw.assignedToEmail,
    raw.technicianEmail,
    raw.tecnicoEmail,
    raw.agentEmail,
    assignment.assignedToEmail,
    assignment.technicianEmail,
    nested.email,
    nested.emailLower
  );
  const username = firstDefined(
    raw.assignedToUsername,
    raw.technicianUsername,
    raw.tecnicoUsername,
    nested.username,
    nested.userName,
    assignment.username
  );
  const avatar = firstDefined(
    raw.assignedToAvatarUrl,
    raw.assignedToAvatar,
    raw.technicianAvatarUrl,
    raw.technicianAvatar,
    raw.tecnicoAvatarUrl,
    raw.tecnicoAvatar,
    assignment.assignedToAvatarUrl,
    assignment.technicianAvatarUrl,
    nested.avatarUrl,
    nested.avatar,
    nested.picture
  );
  const hasAvatar = firstDefined(
    raw.assignedToHasAvatar,
    raw.technicianHasAvatar,
    raw.tecnicoHasAvatar,
    assignment.hasAvatar,
    assignment.technicianHasAvatar,
    nested.hasAvatar
  );

  return {
    userId: cleanText(firstNonEmpty(
      raw.assignedToUserId,
      raw.technicianUserId,
      raw.tecnicoUserId,
      assignment.assignedToUserId,
      assignment.userId,
      nested.userId,
      nested.id
    ), ""),
    name: cleanText(firstNonEmpty(
      raw.assignedToName,
      raw.technicianName,
      raw.tecnicoName,
      raw.agentName,
      assignment.assignedToName,
      assignment.technicianName,
      nested.displayName,
      nested.name,
      nested.nombre
    ), ""),
    email: email === undefined ? undefined : normalizeEmail(email),
    phone: cleanText(firstNonEmpty(
      raw.assignedToPhone,
      raw.technicianPhone,
      raw.tecnicoPhone,
      assignment.assignedToPhone,
      assignment.technicianPhone,
      nested.phone,
      nested.telefono,
      nested.phoneE164,
      nested.mobile,
      nested.movil
    ), ""),
    avatar: hasAvatar === false ? "" : avatar === undefined ? undefined : safeAvatarUrl(avatar),
    username: username === undefined ? undefined : cleanText(username, ""),
    role: cleanText(firstNonEmpty(
      nested.profile?.position,
      nested.position,
      nested.role,
      nested.rol,
      assignment.role
    ), ""),
    status: cleanText(firstNonEmpty(
      nested.status,
      nested.estado,
      nested.active === false ? "inactive" : "active"
    ), "active"),
  };
}

function mergeTicketTechnician(seed = {}, ticket = {}) {
  const incoming = technicianFromTicket(ticket);
  // Ticket IDs retain their domain spelling; visual aliases never create one.
  incoming.lookupUserId = incoming.userId;
  if (seed.userId && incoming.userId && normalizeAvatarUserId(seed.userId) !== normalizeAvatarUserId(incoming.userId)) {
    // Reassignment starts a new person; never inherit the previous contact/photo.
    return incoming;
  }

  return {
    ...seed,
    ...Object.fromEntries(Object.entries(incoming).filter(([key, value]) =>
      value !== undefined && (value !== "" || ["email", "username", "avatar"].includes(key))
    )),
  };
}

export function publicTechnicianProfileFor(tech = {}) {
  const email = normalizeEmail(tech.email);
  const username = handleKey(tech.username).replace(/^@+/, "");
  const name = normalizeName(tech.name);
  const isCristian =
    email === CRISTIAN_PUBLIC_TECHNICIAN_PROFILE.email ||
    username === CRISTIAN_PUBLIC_TECHNICIAN_PROFILE.username ||
    name === "cristian avila" ||
    name === "cristian avila luque";

  return isCristian ? CRISTIAN_PUBLIC_TECHNICIAN_PROFILE : null;
}

function mergeTechnician(snapshot = {}, user = {}) {
  const candidate = safeObject(user);
  const candidateId = cleanText(firstNonEmpty(
    candidate.userId,
    candidate.usuarioId,
    candidate.id,
    candidate.raw?.userId,
    candidate.raw?.id
  ), "");
  // The user request is by snapshot.lookupUserId. A different returned ID cannot
  // enrich this person, even if an email or display name happens to match.
  const source = snapshot.userId && candidateId && normalizeAvatarUserId(snapshot.userId) !== normalizeAvatarUserId(candidateId)
    ? {}
    : candidate;
  const raw = safeObject(source.raw);
  const avatar = firstDefined(
    source.avatarUrl,
    source.avatar,
    source.picture,
    source.photoUrl,
    source.profile?.avatarUrl,
    source.profile?.avatar,
    raw.avatarUrl,
    raw.avatar,
    raw.picture
  );
  const hasAvatar = firstDefined(source.hasAvatar, source.profile?.hasAvatar, raw.hasAvatar);
  const merged = {
    lookupUserId: cleanText(snapshot.lookupUserId, ""),
    userId: cleanText(firstNonEmpty(
      source.userId,
      source.usuarioId,
      source.id,
      raw.userId,
      raw.id,
      snapshot.userId
    ), ""),
    name: cleanText(firstNonEmpty(
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      raw.displayName,
      raw.name,
      snapshot.name
    ), "Técnico"),
    email: normalizeEmail(firstDefined(
      source.email,
      source.emailLower,
      raw.email,
      raw.emailLower,
      snapshot.email
    )),
    phone: cleanText(firstNonEmpty(
      source.phone,
      source.telefono,
      source.phoneE164,
      source.mobile,
      source.movil,
      source.profile?.phone,
      source.profile?.telefono,
      raw.phone,
      raw.telefono,
      snapshot.phone
    ), ""),
    username: cleanText(firstDefined(
      source.username,
      source.userName,
      source.slug,
      raw.username,
      snapshot.username
    ), ""),
    role: cleanText(firstNonEmpty(
      source.profile?.position,
      source.position,
      source.cargo,
      source.role,
      source.rol,
      raw.position,
      raw.role,
      snapshot.role
    ), ""),
    avatar: hasAvatar === false ? "" : safeAvatarUrl(avatar === undefined ? snapshot.avatar : avatar),
    status: cleanText(firstNonEmpty(
      source.status,
      source.estado,
      raw.status,
      source.active === false ? "inactive" : "active",
      snapshot.status
    ), "active"),
    rawUser: source,
  };

  const publicProfile = publicTechnicianProfileFor(merged);
  if (publicProfile?.role) merged.publicRole = publicProfile.role;
  return merged;
}

function statusLabel(value = "") {
  return [
    "inactive", "inactivo", "disabled", "blocked", "suspended",
  ].includes(handleKey(value)) ? "Inactivo" : "Activo";
}

function metricScopeKey(value = "") {
  return handleKey(value).replace(/[.:/]+/g, "_");
}

function aggregateScopeIsPublic(response = {}) {
  const summary = safeObject(response.summary);
  const meta = safeObject(response.meta);
  const markers = [
    summary.scope,
    summary.visibility,
    meta.scope,
    meta.visibility,
    meta.metricScope,
    meta.aggregateScope,
  ].map(metricScopeKey);

  return Boolean(
    summary.public === true ||
    summary.publicTechnicianStats === true ||
    meta.public === true ||
    meta.publicTechnicianStats === true ||
    markers.some((value) =>
      value.includes("technician_public") ||
      value.includes("public_technician") ||
      value.includes("technician_aggregate_public")
    )
  );
}

function resolvedCountFromSummary(response = {}) {
  const summary = safeObject(response.summary);
  const meta = safeObject(response.meta);
  const technicianSummary = safeObject(firstNonEmpty(
    summary.technician,
    summary.technicianStats,
    meta.technician,
    meta.technicianStats,
    {}
  ));

  for (const candidate of [
    technicianSummary.resolvedTotal,
    technicianSummary.resolvedCount,
    technicianSummary.closedTotal,
    technicianSummary.closedCount,
    summary.technicianResolvedTotal,
    summary.technicianResolvedCount,
    summary.resolvedTotal,
    summary.resolvedCount,
    meta.technicianResolvedTotal,
    meta.technicianResolvedCount,
  ]) {
    const parsed = nonNegativeInteger(candidate, null);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function normalizePublicTechnicianMetrics(response = null) {
  const source = safeObject(response);
  const publicScope = aggregateScopeIsPublic(source);
  const explicitResolved = resolvedCountFromSummary(source);
  const responseTotal = nonNegativeInteger(
    firstNonEmpty(
      source.total,
      source.totalCount,
      source.count,
      source.pagination?.total,
      source.meta?.total
    ),
    null
  );

  const resolved = explicitResolved !== null
    ? explicitResolved
    : responseTotal !== null
      ? responseTotal
      : 0;

  return Object.freeze({
    resolvedTotal: resolved,
    resolvedTotalKnown: explicitResolved !== null || responseTotal !== null,
    scope: publicScope ? "public-total" : "session-total",
    publicTotal: publicScope,
    /* Este agregado cuenta incidencias resueltas y NADA MÁS. La valoración tiene
       su propia autoridad: si asomara por aquí habría dos fuentes para un mismo
       número, que es justo el defecto que se está cerrando. */
  });
}

function metricSearchTerm(tech = {}) {
  return cleanText(firstNonEmpty(
    tech.lookupUserId,
    tech.email,
    tech.username,
    tech.name
  ), "");
}

async function requestTechnicianResolvedAggregate(api, tech = {}, publicHints = true) {
  const search = metricSearchTerm(tech);
  const query = {
    pageMode: "cursor",
    limit: PUBLIC_METRIC_LIMIT,
    includeTotal: true,
    responseContract: "v2",
    assigned: true,
    closed: true,
    ...(search ? { q: search } : {}),
  };

  if (publicHints) {
    Object.assign(query, {
      aggregate: "technician-public",
      aggregateOnly: true,
      summaryOnly: true,
      includeItems: false,
      publicMetrics: true,
      technicianUserId: cleanText(tech.lookupUserId, ""),
      assignedToUserId: cleanText(tech.lookupUserId, ""),
      technicianEmail: normalizeEmail(tech.email),
    });
  }

  return api.loadIncidenciasPage({
    force: true,
    cache: false,
    query,
  });
}

export async function loadPublicTechnicianMetrics(api, tech = {}) {
  if (!api || typeof api.loadIncidenciasPage !== "function") {
    return normalizePublicTechnicianMetrics(null);
  }

  /*
    Intento 1: contrato de agregado público. Si el backend lo reconoce, devuelve
    únicamente un resumen/cómputo y nunca necesitamos documentos de terceros.
  */
  try {
    const response = await requestTechnicianResolvedAggregate(api, tech, true);
    const metrics = normalizePublicTechnicianMetrics(response);
    if (metrics.publicTotal) return metrics;

    /*
      Si el backend aún no ha activado el scope público, seguimos pudiendo usar
      el total role-scoped de esta respuesta SIN pintar ninguno de sus items.
    */
    if (metrics.resolvedTotalKnown) return metrics;
  } catch {
    /* Compatibilidad con backend que rechace parámetros de agregado nuevos. */
  }

  /*
    Fallback actual: una única página con includeTotal=true, sin paginar y sin
    renderizar tickets. El número queda etiquetado como ámbito de la sesión.
  */
  try {
    const response = await requestTechnicianResolvedAggregate(api, tech, false);
    return normalizePublicTechnicianMetrics(response);
  } catch {
    return normalizePublicTechnicianMetrics(null);
  }
}

/* =========================================================
   VALORACIONES · UNA AUTORIDAD, RESUELTA EN EL SERVIDOR

   QUIÉN. Se pregunta por la MISMA identidad que el backend congeló en el vínculo
   cuando creó la invitación: el `assignedToUserId` del ticket, que es el
   `lookupUserId` con el que este modal ya pide el usuario. No se pregunta por
   nombre, ni por correo, ni por «el técnico que se ve en pantalla», ni por quien
   mira. Sin identidad no se inventa ninguna: el modal lo dice.

   QUÉ. La media y el recuento llegan hechos. Aquí no se suma nada, no se miran
   las facturas que Facturas tenga cargadas, ni las incidencias de Home, ni el
   historial del navegador. Si la respuesta habla de otro técnico, no se pinta.
========================================================= */
const reviewsApi = () =>
  reviewsApiPromise ||= import("../../views/facturas/facturas.reviews.api.js");

function technicianRatingIdentity(tech = {}) {
  return cleanText(firstNonEmpty(tech.lookupUserId, tech.userId), "");
}

async function loadTechnicianRating(technicianId = "") {
  const asked = cleanText(technicianId, "");
  if (!asked) return { state: TECHNICIAN_RATING_STATES.unresolved };

  try {
    const summary = await (await reviewsApi()).getTechnicianReviewSummary(asked);

    /* La respuesta dice a quién describe. Si no es este técnico, el perfil de A
       no puede terminar enseñando el resumen de B: es un fallo, no un dato. */
    if (cleanText(summary?.technicianId, "") !== asked) {
      return {
        state: TECHNICIAN_RATING_STATES.error,
        message: "El resumen recibido no corresponde a este técnico.",
      };
    }

    if (summary.count === 0) {
      return { state: TECHNICIAN_RATING_STATES.empty, max: summary.max };
    }
    return {
      state: TECHNICIAN_RATING_STATES.value,
      count: summary.count,
      average: summary.average,
      max: summary.max,
    };
  } catch (error) {
    /* Una sesión sin autorización para el agregado NO es un técnico sin
       valoraciones. Decirlo como un vacío sería mentir en la dirección cómoda. */
    const status = errorStatus(error, 0);
    if (status === 401 || status === 403) {
      return { state: TECHNICIAN_RATING_STATES.restricted };
    }
    return {
      state: TECHNICIAN_RATING_STATES.error,
      message: errorMessage(
        error,
        "No se pudo consultar el resumen de valoraciones.",
        ERROR_MESSAGE_POLICIES.messageFirst
      ).slice(0, 160),
    };
  }
}

/* UNA SOLA LECTURA PARA LAS CUATRO SUPERFICIES.
 *
 * La cabecera, la tarjeta «Valoración», el recuento de «Opiniones» y el bloque
 * de estrellas leen ESTE objeto. La nota se formatea una vez y aquí; ninguna de
 * las cuatro la vuelve a componer por su cuenta. */
function technicianRatingView(rating = {}) {
  const raw = safeObject(rating);
  const state = cleanText(raw.state, TECHNICIAN_RATING_STATES.error);
  const max = nonNegativeInteger(raw.max, 0) || TECHNICIAN_RATING_MAX;
  const hasValue = state === TECHNICIAN_RATING_STATES.value;
  const count = hasValue ? (nonNegativeInteger(raw.count, 0) || 0) : 0;
  const average = hasValue ? finiteNumber(raw.average, 0) : null;

  const plural = count === 1 ? "valoración" : "valoraciones";
  /* LA NOTA SE FORMATEA UNA VEZ Y AQUÍ. La tarjeta, la cabecera y el marcador
     grande leen este par; ninguno vuelve a llamar al formateador. */
  const scoreValue = hasValue ? ratingLabel(average, max) : "—";
  const score = hasValue ? `${scoreValue} / ${max}` : "—";
  const texts = {
    [TECHNICIAN_RATING_STATES.loading]: {
      headline: "Consultando valoraciones…",
      hint: "Consultando el resumen del técnico",
      summary: "valoraciones: consultando",
    },
    [TECHNICIAN_RATING_STATES.value]: {
      headline: `${numberLabel(count)} ${plural}`,
      hint: "Media de las valoraciones recibidas por este técnico",
      summary: `${score} · ${numberLabel(count)} ${plural}`,
    },
    [TECHNICIAN_RATING_STATES.empty]: {
      headline: "Sin valoraciones",
      hint: "Todavía no ha recibido ninguna valoración",
      summary: "sin valoraciones",
    },
    [TECHNICIAN_RATING_STATES.restricted]: {
      headline: "No disponible en tu sesión",
      hint: "El resumen de valoraciones está restringido a las autorizaciones actuales",
      summary: "valoraciones no disponibles",
    },
    [TECHNICIAN_RATING_STATES.unresolved]: {
      headline: "Técnico sin identificar",
      hint: "No se ha podido identificar al técnico para consultar su resumen",
      summary: "valoraciones sin consultar",
    },
    [TECHNICIAN_RATING_STATES.error]: {
      headline: "No se pudo cargar",
      hint: cleanText(raw.message, "No se pudo consultar el resumen de valoraciones."),
      summary: "valoraciones no disponibles",
    },
  };
  const text = texts[state] || texts[TECHNICIAN_RATING_STATES.error];

  return Object.freeze({
    state: texts[state] ? state : TECHNICIAN_RATING_STATES.error,
    max,
    count,
    average,
    /* Hasta que el dato esté confirmado no se escribe ninguna nota. */
    scoreValue,
    score,
    opinions: hasValue ? numberLabel(count) : "—",
    headline: text.headline,
    hint: text.hint,
    summary: text.summary,
  });
}

function sectionHeader(title = "", subtitle = "") {
  return `<div class="ui-detail-modal-section-head"><h3>${escapeHtml(title)}</h3>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}</div>`;
}

function metaCard(label = "", value = "—", hint = "", extraClass = "") {
  const safeValue = cleanText(value, "—");
  return `<div class="ui-detail-modal-meta-card ${attr(extraClass)}"><span>${escapeHtml(label)}</span><strong title="${attr(safeValue)}">${escapeHtml(safeValue)}</strong>${hint ? `<span class="inc-technician-meta-hint">${escapeHtml(hint)}</span>` : ""}</div>`;
}

function contactActionIcon(kind = "mail") {
  const common = `aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  if (kind === "phone") {
    return `<svg ${common}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.11 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.47-1.2a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z"/></svg>`;
  }
  return `<svg ${common}><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a2 2 0 0 1-2.06 0L2 7"/></svg>`;
}

function contactCard(label = "", value = "", href = "", actionLabel = "", icon = "mail") {
  const safeValue = cleanText(value, "No disponible");
  const safeHref = cleanText(href, "");
  const iconMarkup = `<span class="inc-technician-contact-icon" aria-hidden="true">${contactActionIcon(icon)}</span>`;
  const content = `${iconMarkup}<span>${escapeHtml(label)}</span><strong title="${attr(safeValue)}">${escapeHtml(safeValue)}</strong>`;
  if (!safeHref) {
    return `<div class="ui-detail-modal-meta-card inc-technician-contact-card">${content}</div>`;
  }
  return `<a class="ui-detail-modal-meta-card incidencias-modal-contact-link inc-technician-contact-card" href="${attr(safeHref)}" aria-label="${attr(actionLabel || `${label}: ${safeValue}`)}" title="${attr(actionLabel || safeValue)}">${content}</a>`;
}

function eyeIcon() {
  return `<svg aria-hidden="true" focusable="false" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function starIcon(filled = false, index = 0) {
  return `<span class="inc-technician-star" data-star-index="${index + 1}" data-star-filled="${filled ? "true" : "false"}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m12 2.75 2.78 5.63 6.22.91-4.5 4.38 1.06 6.19L12 16.94 6.44 19.86 7.5 13.67 3 9.29l6.22-.91L12 2.75Z"/></svg></span>`;
}

function ratingStars(average = 0, max = TECHNICIAN_RATING_MAX) {
  const safe = Math.max(0, Math.min(max, Number(average) || 0));
  return Array.from({ length: max }, (_, index) =>
    starIcon(index + 1 <= Math.floor(safe), index)
  ).join("");
}

function avatarMarkup(tech = {}) {
  const src = safeAvatarUrl(tech.avatar);
  const presentation = resolveAvatarPresentation({
    ...tech,
    displayName: tech.name,
    name: tech.name,
    email: tech.email,
    userId: tech.userId,
    username: tech.username,
  });

  /*
    El wrapper de layout entra explícitamente en opt-out para que nunca pueda
    convertirse en un segundo host anidado. El frame interior es el único host.
  */
  return `<div class="ui-detail-modal-avatar" data-avatar-system="off" data-avatar-managed="false"><div class="ui-detail-modal-avatar-frame" data-avatar-system="true" data-avatar-host="true" data-avatar-authority="global" data-avatar-source="incidencias-technician-profile" data-avatar-name="${attr(tech.name)}" data-avatar-email="${attr(tech.email)}" data-avatar-user-id="${attr(tech.userId)}" data-avatar-username="${attr(tech.username)}" data-avatar-tone="${presentation.tone}" data-avatar-identity="${attr(presentation.fingerprint)}" data-avatar-initials="${attr(presentation.initials)}" data-has-avatar="${src ? "true" : "false"}" aria-hidden="true">${src ? `<img data-avatar-image="true" src="${attr(src)}" alt="" width="224" height="280" loading="eager" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}<span class="ui-detail-modal-avatar-fallback" data-avatar-fallback="true">${escapeHtml(presentation.initials)}</span></div></div>`;
}

function statusChip(tech = {}) {
  const active = statusLabel(tech.status) === "Activo";
  const modifier = active
    ? "incidencias-status-chip--resolved"
    : "incidencias-priority-badge--critical";
  return `<span class="ui-detail-modal-chip ${modifier}">${active ? "Activo" : "Inactivo"}</span>`;
}

function renderRating(view = {}) {
  const value = view.state === TECHNICIAN_RATING_STATES.value;
  const busy = view.state === TECHNICIAN_RATING_STATES.loading;
  const label = value
    ? `Valoración media ${view.score}, ${view.headline}`
    : `Valoración: ${view.headline}`;

  /* Un fallo se puede reintentar sin recargar la sesión ni reabrir el perfil. */
  const retry = view.state === TECHNICIAN_RATING_STATES.error
    ? `<button type="button" class="ui-btn ui-btn-secondary inc-technician-rating-retry" data-technician-profile-action="retry-rating">Reintentar</button>`
    : "";

  return `<div class="inc-technician-rating-card" data-technician-rating="true" data-technician-rating-state="${attr(view.state)}" data-rating-average="${value ? view.average : ""}" data-rating-count="${value ? view.count : ""}" data-rating-max="${view.max}" role="${busy || view.state === TECHNICIAN_RATING_STATES.error ? "status" : "group"}" aria-busy="${busy ? "true" : "false"}" aria-label="${attr(label)}"><div class="inc-technician-rating-score"><strong>${escapeHtml(view.scoreValue)}</strong><span>${value ? `/ ${view.max}` : ""}</span></div><div class="inc-technician-rating-main"><div class="inc-technician-stars" aria-hidden="true">${ratingStars(value ? view.average : 0, view.max)}</div><strong>${escapeHtml(view.headline)}</strong><span>${escapeHtml(view.hint)}</span>${retry}</div></div>`;
}

function renderMetrics(tech = {}, metrics = {}, view = {}) {
  const profile = publicTechnicianProfileFor(tech);
  const resolvedKnown = metrics.resolvedTotalKnown === true;
  const resolved = resolvedKnown ? numberLabel(metrics.resolvedTotal) : "—";
  const publicTotal = metrics.publicTotal === true;
  const resolvedHint = publicTotal
    ? "Cómputo agregado público · sin tickets ni datos de clientes"
    : resolvedKnown
      ? "Cómputo disponible en el ámbito de tu sesión"
      : "El backend aún no ha publicado un cómputo agregado";

  return `<section class="ui-detail-modal-description-section inc-technician-performance" data-technician-public-metrics="true" data-resolved-scope="${attr(metrics.scope || "unknown")}">${sectionHeader("Rendimiento y valoración", "Información pública y segura")}<div class="inc-technician-overview-grid">${metaCard("Incidencias resueltas", resolved, resolvedHint, "inc-technician-resolved-metric")}${metaCard("Valoración", view.score, view.hint)}${metaCard("Opiniones", view.opinions, view.headline)}${profile ? metaCard("Experiencia", `${profile.experienceValue} ${profile.experienceLabel}`, "Trayectoria profesional publicada") : metaCard("Estado", statusLabel(tech.status), "Técnico asignado")}</div>${renderRating(view)}</section>`;
}

function renderLoading(seed = {}) {
  const tech = mergeTechnician(seed, {});
  return renderShell({
    tech,
    summary: "Cargando perfil del técnico…",
    body: `<section class="ui-detail-modal-description-section" aria-busy="true">${sectionHeader("Preparando perfil", "Sólo métricas agregadas")}<div class="inc-technician-overview-grid">${metaCard("Incidencias resueltas", "…")}${metaCard("Valoración", "—", "Consultando el resumen del técnico")}${metaCard("Opiniones", "—", "Consultando valoraciones…")}${metaCard("Perfil", "Cargando…")}</div></section>`,
  });
}

function renderError(seed = {}, message = "") {
  const tech = mergeTechnician(seed, {});
  return renderShell({
    tech,
    summary: "Perfil parcialmente disponible",
    body: `<section class="ui-detail-modal-description-section" role="alert">${sectionHeader("No se pudo completar el perfil", "No se ha expuesto ningún dato de terceros")}<p class="inc-technician-empty">${escapeHtml(message || "No se pudo cargar la información del técnico.")}</p></section>`,
  });
}

/* La frase de la cabecera se compone UNA vez: la usan tanto el pintado completo
   como la actualización en sitio del resumen. */
function profileSummary(metrics = {}, view = {}) {
  const resolvedSummary = metrics.resolvedTotalKnown
    ? `${numberLabel(metrics.resolvedTotal)} resuelta${metrics.resolvedTotal === 1 ? "" : "s"}`
    : "resoluciones sin publicar";
  return `${resolvedSummary} · ${view.summary}`;
}

function renderProfile(tech = {}, metrics = {}, view = {}) {
  const profile = publicTechnicianProfileFor(tech);
  const email = normalizeEmail(tech.email);
  const phone = cleanText(tech.phone, "");
  const dialPhone = phone.replace(/[^+\d]/g, "");
  const roleLabel = cleanText(firstNonEmpty(
    tech.publicRole,
    profile?.role,
    tech.role,
    "Técnico"
  ), "Técnico");

  const body = `
    ${renderMetrics(tech, metrics, view)}

    <section class="ui-detail-modal-contact-section inc-technician-profile-contact">
      ${sectionHeader("Perfil y contacto", "Datos útiles para el cliente")}
      <div class="ui-detail-modal-meta-grid">
        ${metaCard("Función", roleLabel)}
        ${metaCard("Estado", statusLabel(tech.status))}
        ${profile ? metaCard("Experiencia", `${profile.experienceValue} ${profile.experienceLabel}`) : metaCard("Perfil", "Técnico asignado")}
        ${profile ? metaCard("Trayectoria", `${profile.clientsValue} ${profile.clientsLabel}`) : metaCard("Atención", "Directa")}
      </div>
      <div class="inc-technician-contact-grid">
        ${contactCard("Correo", email || "No disponible", email ? `mailto:${email}` : "", email ? `Enviar correo a ${email}` : "", "mail")}
        ${contactCard("Teléfono", phone || "No disponible", dialPhone ? `tel:${dialPhone}` : "", phone ? `Llamar a ${phone}` : "", "phone")}
      </div>
    </section>`;

  return renderShell({ tech, body, summary: profileSummary(metrics, view) });
}

function renderShell({ tech = {}, body = "", summary = "" } = {}) {
  const name = cleanText(tech.name, "Técnico");
  const profile = publicTechnicianProfileFor(tech);
  const role = cleanText(firstNonEmpty(
    tech.publicRole,
    profile?.role,
    tech.role,
    "Técnico"
  ), "Técnico");

  return renderModalShell({
    id: ROOT_ID,
    rootAttributes: {
      "data-technician-profile-root": "true",
      "data-technician-profile-version": INCIDENCIAS_TECHNICIAN_PROFILE_VERSION,
    },
    overlayAttributes: { "data-technician-profile-overlay": "true" },
    panelId: PANEL_ID,
    panelAttributes: { "data-technician-profile-panel": "true" },
    labelledBy: "inc-technician-title",
    describedBy: "inc-technician-summary",
    height: "auto",
    header: `
            <div class="ui-detail-modal-hero">
              ${avatarMarkup(tech)}
              <div class="ui-detail-modal-hero-content">
                <div class="ui-detail-modal-hero-chips"><span class="ui-detail-modal-chip">Técnico</span>${role ? `<span class="ui-detail-modal-chip">${escapeHtml(role)}</span>` : ""}${statusChip(tech)}</div>
                <h2 id="inc-technician-title" class="ui-detail-modal-title">${escapeHtml(name)}</h2>
                <span id="inc-technician-summary" class="ui-detail-modal-updated">${escapeHtml(summary || "Perfil del técnico asignado")}</span>
              </div>
            </div>
            ${renderModalCloseButton({ label: `Cerrar perfil de ${name}`, attributes: { "data-technician-profile-action": "close" } })}`,
    body,
  });
}

function lockBody() {
  return modalLifecycle.activate({ opener: returnFocus });
}

function unlockBody() {
  return modalLifecycle.deactivate({ restoreFocus: false });
}

function modalPanel() {
  return document.getElementById(PANEL_ID);
}

/* EL PANEL QUE ESTA CAPA CUBRE, SI CUBRE ALGUNO.
 *
 * Abierto desde el detalle de una incidencia, el perfil se pinta ENCIMA de su
 * panel. Abierto desde la lista no cubre ninguna capa: no hay empate que
 * deshacer y no se retiene nada. */
function coveredPanel() {
  /* Quién es «el panel» lo dice el shell, no esta capa: se pregunta por su
     selector publicado, no por una copia de su clase. */
  return profileOrigin?.matches?.(DETAIL_ROOT)
    ? profileOrigin.querySelector?.(MODAL_SHELL_SELECTORS.panel)
    : null;
}

function paint(html = "", { focus = false } = {}) {
  if (!profileOrigin?.isConnected) return false;
  const host = profileHost.ensure();
  if (!host) return false;
  renderModalContent(host, html, {
    focusAttributes: ["id", "data-technician-profile-action", "href"],
  });

  /* ESTA CAPA TAMBIÉN ENTRA EN LA PILA.
   *
   * Medido en el navegador: el host del perfil se crea una vez y no se retira;
   * el del detalle se destruye y se vuelve a añadir al final de `body` con cada
   * controlador nuevo. Ambas raíces declaran el mismo `--z-modal`, así que en
   * cuanto el detalle queda DESPUÉS el perfil se pinta debajo y su velo se
   * queda con los clics: el foco entraba, el teclado funcionaba y el ratón no.
   * Tras cambiar de vista y volver, el perfil pasaba de body[8] a body[6] y el
   * detalle de body[7] a body[9].
   *
   * No se inventa aquí ningún z-index ni ningún gestor: se usa la MISMA
   * autoridad de pila que ya usan el visor de adjuntos y la confirmación de
   * cobro. Ella marca lo cubierto y la hoja compartida lo dibuja. */
  heldPanel = coveredPanel() || heldPanel;
  holdModalPanel(heldPanel, { activeLayer: host });

  lockBody();
  queueMicrotask(() => synchronizeAvatars(host));
  if (focus) queueMicrotask(() => restoreModalFocus(modalPanel()));
  return true;
}

/* ACTUALIZACIÓN EN SITIO, SIN REPINTAR EL PANEL.
 *
 * Repintar el modal entero por una sección se llevaría por delante el foco de
 * quien esté navegando. Se sustituyen las DOS superficies que dependen del
 * resumen --la sección de rendimiento y la frase de la cabecera-- y el foco se
 * queda dentro del diálogo. */
function applyRating(tech = {}, metrics = {}, view = {}) {
  const root = document.getElementById(ROOT_ID);
  const section = root?.querySelector?.(METRICS_SECTION);
  if (!root || !section) return false;

  const teniaFoco = Boolean(
    document.activeElement && section.contains(document.activeElement)
  );
  section.outerHTML = renderMetrics(tech, metrics, view);

  const summary = root.querySelector("#inc-technician-summary");
  if (summary) summary.textContent = profileSummary(metrics, view);

  if (teniaFoco) restoreModalFocus(root.querySelector(RETRY_RATING) || modalPanel());
  return true;
}

async function retryRating() {
  const context = ratingContext;
  if (!context || context.sequence !== requestSeq) return false;

  applyRating(context.tech, context.metrics, technicianRatingView({
    state: TECHNICIAN_RATING_STATES.loading,
  }));
  const rating = await loadTechnicianRating(context.technicianId);

  /* Si entretanto se cerró o se abrió otro perfil, esta respuesta ya no es de
     esta pantalla y no se escribe en ella. */
  if (ratingContext !== context || context.sequence !== requestSeq) return false;
  applyRating(context.tech, context.metrics, technicianRatingView(rating));
  return true;
}

function closeProfile({ restoreFocus = true } = {}) {
  requestSeq += 1;
  ratingContext = null;
  profileHost.clear();
  /* Se suelta lo que ESTA capa retuvo, y sólo eso. */
  const released = heldPanel;
  releaseModalPanel(released);
  heldPanel = null;
  unlockBody();
  const target = returnFocus;
  returnFocus = null;
  profileOrigin = null;
  if (restoreFocus) {
    /* El detalle de debajo pudo repintarse mientras el perfil lo cubría: el
       disparador que se pulsó sería entonces un nodo suelto. La autoridad de
       pila busca su equivalente vivo dentro del panel que se acaba de soltar. */
    const vivo = liveModalOpener(target, {
      within: released,
      identity: ["data-ticket-id", "data-technician-profile-trigger", "id"],
    }) || target;
    restoreModalFocus(vivo);
  }
  return true;
}

function technicianTriggerAvatar(trigger = null) {
  const selector = "[data-avatar-user-id], [data-avatar-name], [data-avatar-email], [data-avatar-username]";
  return trigger?.matches?.(selector) ? trigger : trigger?.querySelector?.(selector);
}

function technicianTriggerName(trigger = null) {
  const avatar = technicianTriggerAvatar(trigger);
  if (avatar?.hasAttribute("data-avatar-name")) {
    return cleanText(avatar.dataset.avatarName, "Técnico");
  }
  return cleanText(firstNonEmpty(
    trigger?.querySelector?.(".incidencias-assigned-name")?.textContent,
    trigger?.querySelector?.(".incidencias-modal-technician-copy strong")?.textContent,
    trigger?.querySelector?.("strong")?.textContent,
    trigger?.textContent
  ), "Técnico");
}

function technicianTriggerEmail(trigger = null) {
  const avatar = technicianTriggerAvatar(trigger);
  if (avatar?.hasAttribute("data-avatar-email")) {
    return normalizeEmail(avatar.dataset.avatarEmail);
  }
  const node = trigger?.querySelector?.(".incidencias-modal-technician-email");
  return normalizeEmail(firstNonEmpty(
    node?.textContent,
    node?.getAttribute?.("href")?.replace(/^mailto:/i, "")
  ));
}

function technicianTriggerLookupUserId(trigger = null) {
  return cleanText(firstNonEmpty(
    trigger?.dataset?.technicianUserId,
    trigger?.querySelector?.("[data-technician-user-id]")?.dataset?.technicianUserId
  ), "");
}

function technicianTriggerUserId(trigger = null) {
  const lookupUserId = technicianTriggerLookupUserId(trigger);
  if (lookupUserId) return lookupUserId;
  const avatar = technicianTriggerAvatar(trigger);
  if (avatar?.hasAttribute("data-avatar-user-id")) {
    return cleanText(avatar.dataset.avatarUserId, "");
  }
  return cleanText(trigger?.dataset?.userId, "");
}

function technicianTriggerUsername(trigger = null) {
  const avatar = technicianTriggerAvatar(trigger);
  return cleanText(avatar?.dataset?.avatarUsername, "");
}

function ticketIdFromTrigger(trigger = null) {
  const row = trigger?.closest?.(ROW);
  const detailRoot = trigger?.closest?.(DETAIL_ROOT);
  return cleanText(firstNonEmpty(
    trigger?.dataset?.ticketId,
    row?.dataset?.ticketId,
    row?.dataset?.incidenciaId,
    detailRoot?.dataset?.ticketId,
    detailRoot?.dataset?.incidenciaId
  ), "");
}

function isSupportedTrigger(trigger = null) {
  if (!trigger) return false;
  if (mountRoot?.contains?.(trigger)) return true;
  if (observedModalHost?.contains?.(trigger)) return true;
  return Boolean(trigger.closest?.(DETAIL_ROOT));
}

function decorateTechnicianBadges(root = mountRoot) {
  for (const badge of root?.querySelectorAll?.(LIST_TECH_BADGE) || []) {
    const name = technicianTriggerName(badge);
    badge.classList.add("incidencias-meta-pill--action");
    badge.setAttribute("role", "button");
    badge.setAttribute("tabindex", "0");
    badge.setAttribute("aria-haspopup", "dialog");
    badge.setAttribute("aria-label", `Ver perfil del técnico ${name}`);
    badge.title = `Técnico: ${name}`;
    badge.dataset.technicianProfileTrigger = "true";
  }
}

function decorateDetailTechnicianCards(root = observedModalHost) {
  for (const inline of root?.querySelectorAll?.(DETAIL_TECHNICIAN) || []) {
    const card = inline.closest?.(".incidencias-modal-meta-card");
    if (!card) continue;

    const name = technicianTriggerName(card);
    const id = ticketIdFromTrigger(card) || cleanText(
      inline.closest?.(DETAIL_ROOT)?.dataset?.ticketId,
      ""
    );

    card.classList.add(
      "incidencias-modal-technician-card",
      "incidencias-modal-contact-link"
    );
    card.dataset.technicianProfileTrigger = "true";
    card.dataset.assigned = "true";
    if (id) card.dataset.ticketId = id;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-haspopup", "dialog");
    card.setAttribute("aria-label", `Ver perfil del técnico ${name}`);
    card.title = `Ver perfil del técnico ${name}`;

    const copy = inline.querySelector?.(".incidencias-modal-technician-copy");
    if (copy && !copy.querySelector?.("[data-technician-profile-eye='true']")) {
      const action = document.createElement("span");
      action.className =
        "incidencias-modal-contact-action-copy incidencias-modal-contact-label";
      action.dataset.technicianProfileEye = "true";
      action.setAttribute("aria-hidden", "true");
      action.innerHTML = `<span class="incidencias-modal-contact-icon">${eyeIcon()}</span><span>Ver perfil</span>`;
      copy.appendChild(action);
    }
  }
}

function syncModalObserver() {
  if (!browser()) return false;
  const nextHost = document.querySelector(MODAL_HOST);
  if (nextHost === observedModalHost) return Boolean(nextHost);

  modalObserver?.disconnect?.();
  modalObserver = null;
  observedModalHost = nextHost || null;

  if (observedModalHost && typeof MutationObserver !== "undefined") {
    modalObserver = new MutationObserver(schedule);
    modalObserver.observe(observedModalHost, {
      childList: true,
      subtree: true,
    });
  }
  return Boolean(observedModalHost);
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return;
  syncModalObserver();
  decorateTechnicianBadges();
  decorateDetailTechnicianCards();

  if (
    document.getElementById(ROOT_ID) &&
    returnFocus &&
    !returnFocus.isConnected
  ) {
    returnFocus = null;
  }
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

const incidenceApi = () =>
  incidenceApiPromise ||= import("../../views/incidencias/incidencias.api.js");
const usersApi = () =>
  usersApiPromise ||= import("../../views/usuarios/usuarios.api.js");

async function loadProfile(trigger = null) {
  const id = ticketIdFromTrigger(trigger);
  if (!id) return false;

  const seed = {
    lookupUserId: technicianTriggerLookupUserId(trigger),
    userId: technicianTriggerUserId(trigger),
    name: technicianTriggerName(trigger),
    email: technicianTriggerEmail(trigger),
    username: technicianTriggerUsername(trigger),
    avatar: safeAvatarUrl(trigger?.querySelector?.("img")?.src || ""),
  };

  returnFocus = trigger;
  profileOrigin = trigger?.closest(DETAIL_ROOT) || trigger?.closest("[data-route-host='true']") || mountRoot;
  const sequence = ++requestSeq;
  paint(renderLoading(seed), { focus: true });

  try {
    const api = await incidenceApi();
    let snapshot = seed;

    try {
      const sourceTicket = await api.loadIncidenciaDetail(id, {
        force: false,
        cache: true,
      });
      if (sourceTicket) {
        snapshot = mergeTicketTechnician(seed, sourceTicket);
      }
    } catch {
      /* El perfil puede continuar con la identidad segura del trigger. */
    }

    if (sequence !== requestSeq) return false;

    let user = null;
    if (snapshot.lookupUserId) {
      try {
        user = await (await usersApi()).getUsuarioByIdRequest(
          snapshot.lookupUserId,
          { dedupe: true }
        );
      } catch {
        /* Los usuarios no admin pueden no tener acceso al detalle de Usuarios. */
        user = null;
      }
    }

    if (sequence !== requestSeq) return false;

    const tech = mergeTechnician(snapshot, user || {});

    /* El resumen se pide EN PARALELO con el agregado de incidencias: uno lento no
       retrasa el perfil, y el perfil no afirma ninguna nota mientras la
       pregunta. */
    const technicianId = technicianRatingIdentity(tech);
    const ratingRequest = loadTechnicianRating(technicianId);
    const metrics = await loadPublicTechnicianMetrics(api, tech);

    if (sequence !== requestSeq) return false;
    ratingContext = { sequence, tech, metrics, technicianId };
    paint(renderProfile(tech, metrics, technicianRatingView({
      state: technicianId
        ? TECHNICIAN_RATING_STATES.loading
        : TECHNICIAN_RATING_STATES.unresolved,
    })));

    const rating = await ratingRequest;
    if (sequence !== requestSeq || ratingContext?.sequence !== sequence) return true;
    applyRating(tech, metrics, technicianRatingView(rating));
    return true;
  } catch (error) {
    if (sequence !== requestSeq) return false;
    paint(renderError(seed, errorMessage(error, "No se pudo cargar el perfil del técnico.", ERROR_MESSAGE_POLICIES.messageFirst).slice(0, 240)));
    return false;
  }
}

function profileTriggerFromTarget(target = null) {
  if (!target?.closest) return null;
  if (target.closest(DETAIL_TECHNICIAN) && !target.closest(DETAIL_TECH_CARD)) {
    decorateDetailTechnicianCards(target.closest(MODAL_HOST) || document);
  }
  return target.closest(TECH_TRIGGER);
}

function onClick(event) {
  const target = event.target?.nodeType === 3
    ? event.target.parentElement
    : event.target;

  if (target?.closest?.("[data-technician-profile-action='close']")) {
    event.preventDefault();
    event.stopPropagation();
    closeProfile();
    return;
  }

  if (target?.closest?.(RETRY_RATING)) {
    event.preventDefault();
    event.stopPropagation();
    void retryRating();
    return;
  }

  const trigger = profileTriggerFromTarget(target);
  if (!trigger || !isSupportedTrigger(trigger)) return;

  const nestedLink = target?.closest?.("a[href]");
  if (nestedLink && trigger.contains(nestedLink)) return;

  event.preventDefault();
  event.stopPropagation();
  void loadProfile(trigger);
}

function onKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") return;
  const trigger = profileTriggerFromTarget(event.target);
  if (
    !trigger ||
    !isSupportedTrigger(trigger) ||
    event.target?.closest?.("a[href]")
  ) return;

  event.preventDefault();
  event.stopPropagation();
  void loadProfile(trigger);
}

export function mountIncidenciasTechnicianProfile() {
  if (!browser() || mounted) return false;
  const root = document.querySelector(VIEW);
  if (!root || typeof MutationObserver === "undefined") return false;

  mounted = true;
  mountRoot = root;
  mountRoot.addEventListener("click", onClick, true);
  mountRoot.addEventListener("keydown", onKeydown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);

  observer = new MutationObserver(schedule);
  observer.observe(mountRoot, { childList: true, subtree: true });

  /* El portal del detalle NO cuelga de la vista, sino de `body`, y al cerrarlo se destruye:
     al reabrir hay un host nuevo. Sin mirar dónde aparece, la feature seguía enganchada al
     host anterior y el ojo del técnico sólo salía la primera vez. Se observan sólo los hijos
     directos de `body`, no su subtree. */
  if (document.body) observer.observe(document.body, { childList: true });

  schedule();
  return true;
}

export function destroyIncidenciasTechnicianProfile() {
  if (!browser() || !mounted) return false;
  mounted = false;
  requestSeq += 1;

  mountRoot?.removeEventListener("click", onClick, true);
  mountRoot?.removeEventListener("keydown", onKeydown, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeydown, true);

  observer?.disconnect?.();
  modalObserver?.disconnect?.();
  observer = null;
  modalObserver = null;
  observedModalHost = null;

  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
  closeProfile();
  profileHost.remove();
  mountRoot = null;
  return true;
}

export function getIncidenciasTechnicianProfileSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_TECHNICIAN_PROFILE_VERSION,
    mounted,
    observerScope: "router-view+incidencias-modal-host",
    cssAuthority: "ui-detail-modal+feature-token-composition",
    avatarAuthority: "global-avatar-system",
    metricAuthority: "aggregate-first-incidencias-api",
    publicSafeSurface: true,
    thirdPartyTicketDetailsRendered: false,
    resolvedTicketCardsRendered: false,
    activityTicketCardsRendered: false,
    ratingMax: TECHNICIAN_RATING_MAX,
    ratingAuthority: "api.facturas.tecnicos.valoraciones",
    ratingStates: Object.values(TECHNICIAN_RATING_STATES),
    ratingComputedInBrowser: false,
    ratingSubmissionEnabled: false,
    detailModalIntegrated: Boolean(observedModalHost),
    modalOpen: Boolean(browser() && document.getElementById(ROOT_ID)),
  });
}

if (browser()) mountIncidenciasTechnicianProfile();

export default Object.freeze({
  version: INCIDENCIAS_TECHNICIAN_PROFILE_VERSION,
  mount: mountIncidenciasTechnicianProfile,
  destroy: destroyIncidenciasTechnicianProfile,
  getSnapshot: getIncidenciasTechnicianProfileSnapshot,
});

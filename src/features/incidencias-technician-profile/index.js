/* =========================================================
   Onion Support · Incidencias Technician Profile

   PUBLIC-SAFE METRICS · FIVE-STAR READY · GLOBAL AVATAR AUTHORITY

   Contrato visual/productivo:
   - El modal presenta al técnico, no el historial privado de sus clientes.
   - Usuarios no admin pueden ver un cómputo agregado de resoluciones cuando el
     backend expone el agregado público; nunca se pintan tickets de terceros.
   - Si el backend aún no expone el agregado público, se muestra únicamente el
     total que la sesión actual puede conocer, claramente marcado como ámbito.
   - Valoración preparada para 5 estrellas: empieza en 0,0 / 5 y 0 opiniones.
   - Sin formulario de valoración en esta versión.
   - Avatar delegado al AvatarSystem global y al bridge canónico de técnico.
========================================================= */

"use strict";

import "./style.css";

import {
  resolveAvatarPresentation,
} from "../avatar-system/identity.js";
import {
  synchronizeAvatars,
} from "../avatar-system/index.js";

export const INCIDENCIAS_TECHNICIAN_PROFILE_VERSION =
  "incidencias-technician-profile.v9-public-metrics-rating-ready";

export const TECHNICIAN_RATING_MAX = 5;
export const TECHNICIAN_RATING_INITIAL = Object.freeze({
  average: 0,
  count: 0,
  max: TECHNICIAN_RATING_MAX,
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
const TRUSTED_BLOB_HOST = "onionassets.blob.core.windows.net";
const PUBLIC_METRIC_LIMIT = 1;
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

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
let incidenceApiPromise = null;
let usersApiPromise = null;
let previousBodyOverflow = "";
let previousBodyClasses = new Map();
let bodyLocked = false;

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const text = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

const object = (value, fallback = {}) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !Object.keys(value).length
    ) continue;
    return value;
  }
  return null;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const attr = (value = "") => escapeHtml(text(value, ""));

function normalizeKey(value = "") {
  return text(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.@]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeName(value = "") {
  return text(value, "")
    .toLocaleLowerCase("es-ES")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEmail(value = "") {
  const email = text(value, "").toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safeAvatarUrl(value = "") {
  const raw = text(value, "");
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

function safeError(error = null) {
  return text(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message
    ),
    "No se pudo cargar el perfil del técnico."
  )
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
    .slice(0, 240);
}

function number(value = null, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeInteger(value = null, fallback = null) {
  const parsed = number(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.trunc(parsed));
}

function numberLabel(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
  } catch {
    return String(Number(value) || 0);
  }
}

function ratingLabel(value = 0) {
  const safe = Math.max(0, Math.min(TECHNICIAN_RATING_MAX, Number(value) || 0));
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
  const raw = object(ticket);
  const assignment = object(raw.assignment);
  const nested = object(first(
    raw.assignedTo,
    raw.technician,
    raw.tecnico,
    raw.assignedTechnician,
    assignment.technician,
    assignment.assignedTo,
    {}
  ));

  return {
    userId: text(first(
      raw.assignedToUserId,
      raw.technicianUserId,
      raw.tecnicoUserId,
      assignment.assignedToUserId,
      assignment.userId,
      nested.userId,
      nested.id
    ), ""),
    name: text(first(
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
    email: normalizeEmail(first(
      raw.assignedToEmail,
      raw.technicianEmail,
      raw.tecnicoEmail,
      raw.agentEmail,
      assignment.assignedToEmail,
      assignment.technicianEmail,
      nested.email,
      nested.emailLower
    )),
    phone: text(first(
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
    avatar: safeAvatarUrl(first(
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
    )),
    username: text(first(
      nested.username,
      nested.userName,
      assignment.username
    ), ""),
    role: text(first(
      nested.profile?.position,
      nested.position,
      nested.role,
      nested.rol,
      assignment.role
    ), ""),
    status: text(first(
      nested.status,
      nested.estado,
      nested.active === false ? "inactive" : "active"
    ), "active"),
  };
}

export function publicTechnicianProfileFor(tech = {}) {
  const email = normalizeEmail(tech.email);
  const username = normalizeKey(tech.username).replace(/^@+/, "");
  const name = normalizeName(tech.name);
  const isCristian =
    email === CRISTIAN_PUBLIC_TECHNICIAN_PROFILE.email ||
    username === CRISTIAN_PUBLIC_TECHNICIAN_PROFILE.username ||
    name === "cristian avila" ||
    name === "cristian avila luque";

  return isCristian ? CRISTIAN_PUBLIC_TECHNICIAN_PROFILE : null;
}

function mergeTechnician(snapshot = {}, user = {}) {
  const source = object(user);
  const raw = object(source.raw);
  const merged = {
    userId: text(first(
      source.userId,
      source.usuarioId,
      source.id,
      raw.userId,
      raw.id,
      snapshot.userId
    ), ""),
    name: text(first(
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      raw.displayName,
      raw.name,
      snapshot.name
    ), "Técnico"),
    email: normalizeEmail(first(
      source.email,
      source.emailLower,
      raw.email,
      raw.emailLower,
      snapshot.email
    )),
    phone: text(first(
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
    username: text(first(
      source.username,
      source.userName,
      source.slug,
      raw.username,
      snapshot.username
    ), ""),
    role: text(first(
      source.profile?.position,
      source.position,
      source.cargo,
      source.role,
      source.rol,
      raw.position,
      raw.role,
      snapshot.role
    ), ""),
    avatar: safeAvatarUrl(first(
      source.avatarUrl,
      source.avatar,
      source.picture,
      source.photoUrl,
      source.profile?.avatarUrl,
      source.profile?.avatar,
      raw.avatarUrl,
      raw.avatar,
      raw.picture,
      snapshot.avatar
    )),
    status: text(first(
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
  ].includes(normalizeKey(value)) ? "Inactivo" : "Activo";
}

function metricScopeKey(value = "") {
  return normalizeKey(value).replace(/[.:/]+/g, "_");
}

function aggregateScopeIsPublic(response = {}) {
  const summary = object(response.summary);
  const meta = object(response.meta);
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
  const summary = object(response.summary);
  const meta = object(response.meta);
  const technicianSummary = object(first(
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
  const source = object(response);
  const publicScope = aggregateScopeIsPublic(source);
  const explicitResolved = resolvedCountFromSummary(source);
  const responseTotal = nonNegativeInteger(
    first(
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
    ratingAverage: TECHNICIAN_RATING_INITIAL.average,
    ratingCount: TECHNICIAN_RATING_INITIAL.count,
    ratingMax: TECHNICIAN_RATING_INITIAL.max,
  });
}

function metricSearchTerm(tech = {}) {
  return text(first(
    tech.userId,
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
      technicianUserId: text(tech.userId, ""),
      assignedToUserId: text(tech.userId, ""),
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

function sectionHeader(title = "", subtitle = "") {
  return `<div class="ui-detail-modal-section-head"><h3>${escapeHtml(title)}</h3>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}</div>`;
}

function metaCard(label = "", value = "—", hint = "", extraClass = "") {
  const safeValue = text(value, "—");
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
  const safeValue = text(value, "No disponible");
  const safeHref = text(href, "");
  const iconMarkup = `<span class="inc-technician-contact-icon" aria-hidden="true">${contactActionIcon(icon)}</span>`;
  const content = `${iconMarkup}<span>${escapeHtml(label)}</span><strong title="${attr(safeValue)}">${escapeHtml(safeValue)}</strong>`;
  if (!safeHref) {
    return `<div class="ui-detail-modal-meta-card inc-technician-contact-card">${content}</div>`;
  }
  return `<a class="ui-detail-modal-meta-card incidencias-modal-contact-link inc-technician-contact-card" href="${attr(safeHref)}" aria-label="${attr(actionLabel || `${label}: ${safeValue}`)}" title="${attr(actionLabel || safeValue)}">${content}</a>`;
}

function closeIcon() {
  return `<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
}

function eyeIcon() {
  return `<svg aria-hidden="true" focusable="false" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
}

function starIcon(filled = false, index = 0) {
  return `<span class="inc-technician-star" data-star-index="${index + 1}" data-star-filled="${filled ? "true" : "false"}" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="m12 2.75 2.78 5.63 6.22.91-4.5 4.38 1.06 6.19L12 16.94 6.44 19.86 7.5 13.67 3 9.29l6.22-.91L12 2.75Z"/></svg></span>`;
}

function ratingStars(average = 0) {
  const safe = Math.max(0, Math.min(TECHNICIAN_RATING_MAX, Number(average) || 0));
  return Array.from({ length: TECHNICIAN_RATING_MAX }, (_, index) =>
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

function renderRating(metrics = {}) {
  const average = Number(metrics.ratingAverage) || 0;
  const count = nonNegativeInteger(metrics.ratingCount, 0) || 0;
  const label = `${ratingLabel(average)} de ${TECHNICIAN_RATING_MAX}, ${numberLabel(count)} valoraciones`;

  return `<div class="inc-technician-rating-card" data-technician-rating="true" data-rating-average="${average}" data-rating-count="${count}" data-rating-max="${TECHNICIAN_RATING_MAX}" aria-label="${attr(`Valoración media ${label}`)}"><div class="inc-technician-rating-score"><strong>${escapeHtml(ratingLabel(average))}</strong><span>/ ${TECHNICIAN_RATING_MAX}</span></div><div class="inc-technician-rating-main"><div class="inc-technician-stars" aria-hidden="true">${ratingStars(average)}</div><strong>${count ? `${numberLabel(count)} valoración${count === 1 ? "" : "es"}` : "Sin valoraciones todavía"}</strong><span>La valoración se activará en una fase posterior al cierre de incidencias. Este modal ya está preparado para mostrarla.</span></div></div>`;
}

function renderMetrics(tech = {}, metrics = {}) {
  const profile = publicTechnicianProfileFor(tech);
  const resolvedKnown = metrics.resolvedTotalKnown === true;
  const resolved = resolvedKnown ? numberLabel(metrics.resolvedTotal) : "—";
  const publicTotal = metrics.publicTotal === true;
  const resolvedHint = publicTotal
    ? "Cómputo agregado público · sin tickets ni datos de clientes"
    : resolvedKnown
      ? "Cómputo disponible en el ámbito de tu sesión"
      : "El backend aún no ha publicado un cómputo agregado";

  return `<section class="ui-detail-modal-description-section inc-technician-performance" data-technician-public-metrics="true" data-resolved-scope="${attr(metrics.scope || "unknown")}">${sectionHeader("Rendimiento y valoración", "Información pública y segura")}<div class="inc-technician-overview-grid">${metaCard("Incidencias resueltas", resolved, resolvedHint, "inc-technician-resolved-metric")}${metaCard("Valoración", `${ratingLabel(metrics.ratingAverage)} / ${TECHNICIAN_RATING_MAX}`, "Sistema preparado para 5 estrellas")}${metaCard("Opiniones", numberLabel(metrics.ratingCount || 0), "Se habilitarán con el flujo de cierre")}${profile ? metaCard("Experiencia", `${profile.experienceValue} ${profile.experienceLabel}`, "Trayectoria profesional publicada") : metaCard("Estado", statusLabel(tech.status), "Técnico asignado")}</div>${renderRating(metrics)}</section>`;
}

function renderLoading(seed = {}) {
  const tech = mergeTechnician(seed, {});
  return renderShell({
    tech,
    summary: "Cargando perfil del técnico…",
    body: `<section class="ui-detail-modal-description-section" aria-busy="true">${sectionHeader("Preparando perfil", "Sólo métricas agregadas")}<div class="inc-technician-overview-grid">${metaCard("Incidencias resueltas", "…")}${metaCard("Valoración", "0,0 / 5")}${metaCard("Opiniones", "0")}${metaCard("Perfil", "Cargando…")}</div></section>`,
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

function renderProfile(tech = {}, metrics = {}) {
  const profile = publicTechnicianProfileFor(tech);
  const email = normalizeEmail(tech.email);
  const phone = text(tech.phone, "");
  const dialPhone = phone.replace(/[^+\d]/g, "");
  const roleLabel = text(first(
    tech.publicRole,
    profile?.role,
    tech.role,
    "Técnico"
  ), "Técnico");

  const body = `
    ${renderMetrics(tech, metrics)}

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

  const resolvedSummary = metrics.resolvedTotalKnown
    ? `${numberLabel(metrics.resolvedTotal)} resuelta${metrics.resolvedTotal === 1 ? "" : "s"}`
    : "resoluciones sin publicar";
  const summary = `${resolvedSummary} · ${ratingLabel(metrics.ratingAverage)} / ${TECHNICIAN_RATING_MAX}`;

  return renderShell({ tech, body, summary });
}

function renderShell({ tech = {}, body = "", summary = "" } = {}) {
  const name = text(tech.name, "Técnico");
  const profile = publicTechnicianProfileFor(tech);
  const role = text(first(
    tech.publicRole,
    profile?.role,
    tech.role,
    "Técnico"
  ), "Técnico");

  return `
    <section id="${ROOT_ID}" class="ui-detail-modal-root" data-technician-profile-root="true" data-technician-profile-version="${INCIDENCIAS_TECHNICIAN_PROFILE_VERSION}">
      <div class="ui-detail-modal-overlay" data-technician-profile-overlay="true">
        <div id="${PANEL_ID}" class="ui-detail-modal-panel" data-technician-profile-panel="true" role="dialog" aria-modal="true" aria-labelledby="inc-technician-title" aria-describedby="inc-technician-summary" tabindex="-1">
          <header class="ui-detail-modal-header">
            <div class="ui-detail-modal-hero">
              ${avatarMarkup(tech)}
              <div class="ui-detail-modal-hero-content">
                <div class="ui-detail-modal-hero-chips"><span class="ui-detail-modal-chip">Técnico</span>${role ? `<span class="ui-detail-modal-chip">${escapeHtml(role)}</span>` : ""}${statusChip(tech)}</div>
                <h2 id="inc-technician-title" class="ui-detail-modal-title">${escapeHtml(name)}</h2>
                <span id="inc-technician-summary" class="ui-detail-modal-updated">${escapeHtml(summary || "Perfil del técnico asignado")}</span>
              </div>
            </div>
            <button type="button" class="incidencias-modal-close-btn ui-detail-modal-close-btn" data-technician-profile-action="close" aria-label="Cerrar perfil de ${attr(name)}">${closeIcon()}</button>
          </header>
          <main class="ui-detail-modal-body">${body}</main>
        </div>
      </div>
    </section>`;
}

function ensureHost() {
  if (!browser()) return null;
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.dataset.technicianProfileHost = "true";
    document.body.appendChild(host);
  }
  return host;
}

function lockBody() {
  if (!browser() || bodyLocked) return;
  previousBodyOverflow = document.body.style.overflow || "";
  previousBodyClasses = new Map([
    ["modal-open", document.body.classList.contains("modal-open")],
    ["ui-detail-modal-open", document.body.classList.contains("ui-detail-modal-open")],
  ]);
  document.body.classList.add("modal-open", "ui-detail-modal-open");
  document.body.style.overflow = "hidden";
  bodyLocked = true;
}

function unlockBody() {
  if (!browser() || !bodyLocked) return;
  for (const [name, existed] of previousBodyClasses.entries()) {
    if (!existed) document.body.classList.remove(name);
  }
  document.body.style.overflow = previousBodyOverflow;
  previousBodyClasses = new Map();
  previousBodyOverflow = "";
  bodyLocked = false;
}

function modalPanel() {
  return document.getElementById(PANEL_ID);
}

function paint(html = "", { focus = false } = {}) {
  const host = ensureHost();
  if (!host) return false;

  const template = document.createElement("template");
  template.innerHTML = String(html || "").trim();
  const nextRoot = template.content.querySelector(`#${ROOT_ID}`);
  const nextPanel = nextRoot?.querySelector?.(`#${PANEL_ID}`) || null;
  const currentRoot = host.querySelector(`#${ROOT_ID}`);
  const currentPanel = currentRoot?.querySelector?.(`#${PANEL_ID}`) || null;

  if (currentRoot && currentPanel && nextPanel) {
    for (const attribute of Array.from(nextPanel.attributes || [])) {
      currentPanel.setAttribute(attribute.name, attribute.value);
    }
    currentPanel.replaceChildren(...Array.from(nextPanel.childNodes));
  } else {
    host.replaceChildren(template.content);
  }

  lockBody();
  queueMicrotask(() => synchronizeAvatars(host));

  if (focus) {
    queueMicrotask(() => modalPanel()?.focus?.({ preventScroll: true }));
  }
  return true;
}

function closeProfile() {
  requestSeq += 1;
  document.getElementById(HOST_ID)?.replaceChildren();
  unlockBody();
  const target = returnFocus;
  returnFocus = null;
  if (target?.isConnected && typeof target.focus === "function") {
    try {
      target.focus({ preventScroll: true });
    } catch {
      /* noop */
    }
  }
  return true;
}

function technicianTriggerName(trigger = null) {
  return text(first(
    trigger?.querySelector?.(".incidencias-assigned-name")?.textContent,
    trigger?.querySelector?.(".incidencias-modal-technician-copy strong")?.textContent,
    trigger?.querySelector?.("strong")?.textContent,
    trigger?.textContent
  ), "Técnico");
}

function technicianTriggerEmail(trigger = null) {
  const node = trigger?.querySelector?.(".incidencias-modal-technician-email");
  return normalizeEmail(first(
    node?.textContent,
    node?.getAttribute?.("href")?.replace(/^mailto:/i, "")
  ));
}

function technicianTriggerUserId(trigger = null) {
  return text(first(
    trigger?.dataset?.technicianUserId,
    trigger?.dataset?.userId,
    trigger?.querySelector?.("[data-technician-user-id]")?.dataset?.technicianUserId
  ), "");
}

function ticketIdFromTrigger(trigger = null) {
  const row = trigger?.closest?.(ROW);
  const detailRoot = trigger?.closest?.(DETAIL_ROOT);
  return text(first(
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
    const id = ticketIdFromTrigger(card) || text(
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
    userId: technicianTriggerUserId(trigger),
    name: technicianTriggerName(trigger),
    email: technicianTriggerEmail(trigger),
    avatar: safeAvatarUrl(trigger?.querySelector?.("img")?.src || ""),
  };

  returnFocus = trigger;
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
        snapshot = {
          ...seed,
          ...technicianFromTicket(sourceTicket),
        };
      }
    } catch {
      /* El perfil puede continuar con la identidad segura del trigger. */
    }

    if (sequence !== requestSeq) return false;

    let user = null;
    if (snapshot.userId) {
      try {
        user = await (await usersApi()).getUsuarioByIdRequest(
          snapshot.userId,
          { dedupe: true }
        );
      } catch {
        /* Los usuarios no admin pueden no tener acceso al detalle de Usuarios. */
        user = null;
      }
    }

    if (sequence !== requestSeq) return false;

    const tech = mergeTechnician(snapshot, user || {});
    const metrics = await loadPublicTechnicianMetrics(api, tech);

    if (sequence !== requestSeq) return false;
    paint(renderProfile(tech, metrics));
    return true;
  } catch (error) {
    if (sequence !== requestSeq) return false;
    paint(renderError(seed, safeError(error)));
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

  const overlay = target?.closest?.("[data-technician-profile-overlay='true']");
  if (overlay && target === overlay) {
    event.preventDefault();
    event.stopPropagation();
    closeProfile();
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

function trapFocus(event) {
  const panel = modalPanel();
  if (!panel) return false;
  const items = [...panel.querySelectorAll(FOCUSABLE)]
    .filter((node) => !node.disabled && node.getAttribute("aria-hidden") !== "true");

  if (!items.length) {
    event.preventDefault();
    panel.focus();
    return true;
  }

  const firstItem = items[0];
  const lastItem = items.at(-1);
  if (event.shiftKey && document.activeElement === firstItem) {
    event.preventDefault();
    lastItem.focus();
    return true;
  }
  if (!event.shiftKey && document.activeElement === lastItem) {
    event.preventDefault();
    firstItem.focus();
    return true;
  }
  return false;
}

function onKeydown(event) {
  if (document.getElementById(ROOT_ID)) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeProfile();
      return;
    }
    if (event.key === "Tab") {
      trapFocus(event);
      return;
    }
  }

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
  document.getElementById(HOST_ID)?.remove?.();
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
    ratingInitialAverage: TECHNICIAN_RATING_INITIAL.average,
    ratingInitialCount: TECHNICIAN_RATING_INITIAL.count,
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

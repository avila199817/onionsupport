/* =========================================================
   Onion Support · Incidencias Technician Profile
   CLIENT TRUST · ROLE-SCOPED HISTORY · GLOBAL AVATAR AUTHORITY
========================================================= */

import "./style.css";

import {
  resolveAvatarPresentation,
} from "../avatar-system/identity.js";
import {
  synchronizeAvatars,
} from "../avatar-system/index.js";

export const INCIDENCIAS_TECHNICIAN_PROFILE_VERSION =
  "incidencias-technician-profile.v8.client-trust-resolved-history";

const VIEW = "#view-container, [data-router-view='true']";
const LIST_TECH_BADGE = ".incidencias-assigned-badge[data-assigned='true']";
const DETAIL_TECHNICIAN = ".incidencias-modal-technician-inline[data-modal-technician='true'][data-technician-assigned='true']";
const DETAIL_TECH_CARD = ".incidencias-modal-technician-card[data-technician-profile-trigger='true'][data-assigned='true']";
const TECH_TRIGGER = `${LIST_TECH_BADGE}, ${DETAIL_TECH_CARD}`;
const PRIORITY_BADGE = ".incidencias-priority-badge[data-priority-badge]";
const DETAIL_PRIORITY = ".incidencias-modal-chip[class*='incidencias-modal-chip--priority-']";
const ROW = "[data-ticket-row='true']";
const DETAIL_ROOT = "[data-incidencias-modal-root='true']";
const MODAL_HOST = "[data-incidencias-modal-host='true']";
const HOST_ID = "incidencias-technician-profile-host";
const ROOT_ID = "incidencias-technician-profile-root";
const PANEL_ID = "incidencias-technician-profile-panel";
const TRUSTED_BLOB_HOST = "onionassets.blob.core.windows.net";
const HISTORY_PAGE_LIMIT = 48;
const HISTORY_SEARCH_MAX_PAGES = 4;
const HISTORY_FALLBACK_MAX_PAGES = 8;
const HISTORY_CARD_LIMIT = 4;
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/*
  Fuente: perfil público canónico de Onion Support.
  No se inventan valoraciones ni testimonios. El modal reutiliza literalmente
  la fotografía, experiencia y método publicados en la Home.
*/
export const CRISTIAN_PUBLIC_TECHNICIAN_PROFILE = Object.freeze({
  id: "cristian-avila",
  name: "Cristian Ávila",
  role: "Técnico informático",
  email: "cristian@onionsupport.com",
  username: "cristian",
  photo: "/src/media/img/Cristian_Avila_224.webp",
  summary: "Diagnóstico claro, trato directo y reparación con criterio antes de tocar nada.",
  experienceValue: "+8",
  experienceLabel: "años de experiencia",
  clientsValue: "+300",
  clientsLabel: "clientes atendidos",
  method: Object.freeze([
    Object.freeze({
      title: "Diagnóstico primero",
      text: "Reviso síntomas, urgencia y contexto antes de tocar nada. Claridad antes que prisas.",
    }),
    Object.freeze({
      title: "Solución con criterio",
      text: "Te explico qué merece la pena reparar, qué conviene mejorar y qué no compensa.",
    }),
    Object.freeze({
      title: "Presupuesto y factura",
      text: "Intervención formal, presupuesto previo y factura disponible para particulares y negocios.",
    }),
  ]),
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

const array = (value) => {
  if (Array.isArray(value)) return value;
  try {
    return value ? Array.from(value) : [];
  } catch {
    return [];
  }
};

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

function displayLabel(value = "", fallback = "") {
  const raw = text(value, fallback);
  if (!raw) return "";
  return `${raw.charAt(0).toUpperCase()}${raw.slice(1)}`;
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
  const raw = text(
    first(
      error?.message,
      error?.data?.message,
      error?.payload?.message
    ),
    "No se pudo cargar el perfil del técnico."
  );
  return raw
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1***")
    .slice(0, 240);
}

function numberLabel(value = 0) {
  try {
    return new Intl.NumberFormat("es-ES").format(Number(value) || 0);
  } catch {
    return String(Number(value) || 0);
  }
}

function percentLabel(value = 0) {
  return `${Math.round(Math.max(0, Math.min(100, Number(value) || 0)))} %`;
}

function dateValue(value = null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateTimeLabel(value = null, fallback = "Sin actividad registrada") {
  const stamp = dateValue(value);
  if (!stamp) return fallback;
  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(stamp));
  } catch {
    return fallback;
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
      raw.agentPhone,
      assignment.assignedToPhone,
      assignment.technicianPhone,
      assignment.agentPhone,
      assignment.phone,
      assignment.telefono,
      assignment.technician?.phone,
      assignment.technician?.telefono,
      assignment.assignedTo?.phone,
      assignment.assignedTo?.telefono,
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
      raw.agentAvatarUrl,
      assignment.assignedToAvatarUrl,
      assignment.technicianAvatarUrl,
      nested.avatarUrl,
      nested.avatar
    )),
    username: text(first(
      nested.username,
      nested.userName,
      assignment.username
    ), ""),
    role: text(first(nested.role, nested.rol, assignment.role), ""),
  };
}

function ticketId(ticket = {}) {
  return text(first(
    ticket.ticketId,
    ticket.incidenciaId,
    ticket.id,
    ticket.code,
    ticket.numero
  ), "");
}

function ticketStatus(ticket = {}) {
  return normalizeKey(first(
    ticket.status,
    ticket.estado,
    ticket.statusKey,
    ticket.lifecycle?.status,
    "open"
  ));
}

function isClosedTicket(ticket = {}) {
  return [
    "closed", "resolved", "cerrada", "cerrado", "resuelta", "resuelto",
  ].includes(ticketStatus(ticket));
}

function ticketPriority(ticket = {}) {
  return normalizeKey(first(
    ticket.priority,
    ticket.prioridad,
    ticket.priorityKey,
    ticket.severity,
    "medium"
  ));
}

function ticketTitle(ticket = {}) {
  return text(first(
    ticket.subject,
    ticket.asunto,
    ticket.title,
    ticket.titulo,
    ticket.summary,
    ticket.resumen
  ), "Sin asunto");
}

function ticketCreatedAt(ticket = {}) {
  return first(
    ticket.createdAt,
    ticket.created_at,
    ticket.fechaCreacion,
    ticket.created,
    ticket.audit?.createdAt,
    ticket._ts
  );
}

function ticketClosedAt(ticket = {}) {
  return first(
    ticket.closedAt,
    ticket.closed_at,
    ticket.resolvedAt,
    ticket.resolved_at,
    ticket.lifecycle?.closedAt,
    ticket.lifecycle?.resolvedAt,
    ticket.updatedAt,
    ticket.updated_at,
    ticketCreatedAt(ticket)
  );
}

function ticketActivityAt(ticket = {}) {
  return first(
    isClosedTicket(ticket) ? ticketClosedAt(ticket) : null,
    ticket.lastActivityAt,
    ticket.updatedAt,
    ticket.updated_at,
    ticketCreatedAt(ticket)
  );
}

function ticketStatusLabel(ticket = {}) {
  const key = ticketStatus(ticket);
  if (isClosedTicket(ticket)) return "Resuelta";
  if (["pending", "pendiente", "new", "nueva", "nuevo"].includes(key)) {
    return "Pendiente";
  }
  if ([
    "in_progress", "inprogress", "progress", "assigned", "proceso", "en_proceso",
  ].includes(key)) return "En curso";
  return "Abierta";
}

function priorityLabel(ticket = {}) {
  const key = ticketPriority(ticket);
  if ([
    "urgent", "urgente", "critical", "critica", "critico", "p0", "p1",
  ].includes(key)) return "Urgente";
  if (["high", "alta", "alto"].includes(key)) return "Alta";
  if (["low", "baja", "bajo"].includes(key)) return "Baja";
  return "Media";
}

export function isSameTechnician(ticket = {}, tech = {}) {
  const current = technicianFromTicket(ticket);
  if (tech.userId && current.userId) {
    return tech.userId.toLowerCase() === current.userId.toLowerCase();
  }
  if (tech.email && current.email) return tech.email === current.email;
  if (tech.username && current.username) {
    return normalizeKey(tech.username) === normalizeKey(current.username);
  }
  if (tech.name && current.name) {
    return normalizeName(tech.name) === normalizeName(current.name);
  }
  return false;
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
  const merged = {
    userId: text(first(
      source.userId,
      source.usuarioId,
      source.id,
      snapshot.userId
    ), ""),
    name: text(first(
      source.displayName,
      source.fullName,
      source.name,
      source.nombre,
      snapshot.name
    ), "Técnico"),
    email: normalizeEmail(first(
      source.email,
      source.emailLower,
      snapshot.email
    )),
    phone: text(first(
      source.phone,
      source.telefono,
      source.phoneE164,
      source.mobile,
      source.movil,
      source.contacto?.phone,
      source.contacto?.telefono,
      source.profile?.phone,
      source.profile?.telefono,
      source.profile?.mobile,
      snapshot.phone
    ), ""),
    username: text(first(
      source.username,
      source.userName,
      source.slug,
      snapshot.username
    ), ""),
    role: text(first(
      source.profile?.position,
      source.position,
      source.cargo,
      source.role,
      source.rol,
      snapshot.role
    ), ""),
    avatar: safeAvatarUrl(first(
      source.avatarUrl,
      source.avatar,
      source.picture,
      source.photoUrl,
      source.profile?.avatarUrl,
      source.profile?.avatar,
      source.profile?.picture,
      snapshot.avatar
    )),
    status: text(first(
      source.status,
      source.estado,
      source.active === false ? "inactive" : "active"
    ), "active"),
  };

  const publicProfile = publicTechnicianProfileFor(merged);
  if (!merged.avatar && publicProfile?.photo) {
    merged.avatar = safeAvatarUrl(publicProfile.photo);
  }
  if (publicProfile?.role) merged.publicRole = publicProfile.role;
  return merged;
}

function statusLabel(value = "") {
  return [
    "inactive", "inactivo", "disabled", "blocked", "suspended",
  ].includes(normalizeKey(value)) ? "Inactivo" : "Activo";
}

function responseCursor(response = {}) {
  return text(first(
    response.nextCursor,
    response.pagination?.nextCursor,
    response.meta?.nextCursor
  ), "");
}

function historySearchTerm(tech = {}) {
  return text(first(tech.email, tech.username, tech.name), "");
}

function dedupeTickets(items = []) {
  const map = new Map();
  for (const ticket of array(items)) {
    const id = ticketId(ticket);
    if (!id) continue;
    map.set(id, ticket);
  }
  return [...map.values()];
}

async function collectHistoryWindow(
  api,
  tech = {},
  {
    closed = false,
    queryText = "",
    maxPages = HISTORY_SEARCH_MAX_PAGES,
  } = {}
) {
  const matches = new Map();
  let cursor = "";
  let pages = 0;
  let exhausted = false;

  do {
    const response = await api.loadIncidenciasPage({
      force: true,
      cache: false,
      query: {
        pageMode: "cursor",
        limit: HISTORY_PAGE_LIMIT,
        includeTotal: false,
        responseContract: "v2",
        assigned: true,
        closed,
        ...(queryText ? { q: queryText } : {}),
        ...(cursor ? { cursor } : {}),
      },
    });

    pages += 1;
    for (const ticket of array(response?.items)) {
      if (isSameTechnician(ticket, tech)) {
        const id = ticketId(ticket);
        if (id) matches.set(id, ticket);
      }
    }

    cursor = responseCursor(response);
    exhausted = !cursor && response?.hasMore !== true;
  } while (cursor && pages < maxPages);

  return {
    items: [...matches.values()],
    pages,
    exhausted,
    queryText,
  };
}

async function loadStatusHistory(api, tech = {}, closed = false) {
  const queryText = historySearchTerm(tech);
  let window = await collectHistoryWindow(api, tech, {
    closed,
    queryText,
    maxPages: HISTORY_SEARCH_MAX_PAGES,
  });

  /*
    Algunas versiones antiguas del backend no buscaban por técnico dentro de q.
    Si el resultado filtrado no aporta ninguna coincidencia, hacemos fallback
    cursor-safe sobre el conjunto role-scoped. Nunca saltamos el RBAC del API.
  */
  if (!window.items.length && queryText) {
    window = await collectHistoryWindow(api, tech, {
      closed,
      queryText: "",
      maxPages: HISTORY_FALLBACK_MAX_PAGES,
    });
  }

  return window;
}

export function summarizeTechnicianTickets(
  activeItems = [],
  closedItems = [],
  tech = {},
  sourceTicket = null,
  {
    activeExhausted = false,
    closedExhausted = false,
    partial = false,
  } = {}
) {
  const active = dedupeTickets(activeItems)
    .filter((ticket) => !isClosedTicket(ticket) && isSameTechnician(ticket, tech));
  const closed = dedupeTickets(closedItems)
    .filter((ticket) => isClosedTicket(ticket) && isSameTechnician(ticket, tech));

  if (sourceTicket && isSameTechnician(sourceTicket, tech)) {
    const target = isClosedTicket(sourceTicket) ? closed : active;
    const sourceId = ticketId(sourceTicket);
    if (sourceId && !target.some((ticket) => ticketId(ticket) === sourceId)) {
      target.push(sourceTicket);
    }
  }

  const activeUnique = dedupeTickets(active);
  const closedUnique = dedupeTickets(closed);
  const all = dedupeTickets([...activeUnique, ...closedUnique]);
  const urgent = activeUnique.filter((ticket) => [
    "urgent", "urgente", "critical", "critica", "critico", "high", "alta", "p0", "p1",
  ].includes(ticketPriority(ticket))).length;
  const resolutionRate = all.length ? (closedUnique.length / all.length) * 100 : 0;
  const activeRate = all.length ? (activeUnique.length / all.length) * 100 : 0;
  const recent = [...all]
    .sort((a, b) => dateValue(ticketActivityAt(b)) - dateValue(ticketActivityAt(a)))
    .slice(0, HISTORY_CARD_LIMIT);
  const resolvedRecent = [...closedUnique]
    .sort((a, b) => dateValue(ticketClosedAt(b)) - dateValue(ticketClosedAt(a)))
    .slice(0, HISTORY_CARD_LIMIT);

  return {
    assigned: all.length,
    active: activeUnique.length,
    closed: closedUnique.length,
    urgent,
    resolutionRate,
    activeRate,
    exact: activeExhausted && closedExhausted && !partial,
    partial: partial || !activeExhausted || !closedExhausted,
    recent,
    resolvedRecent,
  };
}

async function loadTechnicianHistory(api, tech = {}, sourceTicket = null) {
  const results = await Promise.allSettled([
    loadStatusHistory(api, tech, false),
    loadStatusHistory(api, tech, true),
  ]);

  const activeWindow = results[0].status === "fulfilled"
    ? results[0].value
    : { items: [], exhausted: false };
  const closedWindow = results[1].status === "fulfilled"
    ? results[1].value
    : { items: [], exhausted: false };

  return summarizeTechnicianTickets(
    activeWindow.items,
    closedWindow.items,
    tech,
    sourceTicket,
    {
      activeExhausted: activeWindow.exhausted,
      closedExhausted: closedWindow.exhausted,
      partial: results.some((result) => result.status === "rejected"),
    }
  );
}

function sectionHeader(title = "", subtitle = "") {
  return `<div class="ui-detail-modal-section-head"><h3>${escapeHtml(title)}</h3>${subtitle ? `<span>${escapeHtml(subtitle)}</span>` : ""}</div>`;
}

function metaCard(label = "", value = "—", hint = "") {
  const safeValue = text(value, "—");
  return `<div class="ui-detail-modal-meta-card"><span>${escapeHtml(label)}</span><strong title="${attr(safeValue)}">${escapeHtml(safeValue)}</strong>${hint ? `<span class="inc-technician-meta-hint">${escapeHtml(hint)}</span>` : ""}</div>`;
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

function avatarMarkup(tech = {}) {
  const publicProfile = publicTechnicianProfileFor(tech);
  const src = safeAvatarUrl(first(tech.avatar, publicProfile?.photo));
  const presentation = resolveAvatarPresentation({
    ...tech,
    displayName: tech.name,
    name: tech.name,
    email: tech.email,
    userId: tech.userId,
    username: tech.username,
  });

  return `<div class="ui-detail-modal-avatar"><div class="ui-detail-modal-avatar-frame" data-avatar-system="true" data-avatar-host="true" data-avatar-authority="global" data-avatar-source="incidencias-technician-profile" data-avatar-name="${attr(tech.name)}" data-avatar-email="${attr(tech.email)}" data-avatar-user-id="${attr(tech.userId)}" data-avatar-username="${attr(tech.username)}" data-avatar-tone="${presentation.tone}" data-avatar-identity="${attr(presentation.fingerprint)}" data-avatar-initials="${attr(presentation.initials)}" data-has-avatar="${src ? "true" : "false"}" aria-hidden="true">${src ? `<img data-avatar-image="true" src="${attr(src)}" alt="" width="224" height="280" loading="eager" decoding="async" referrerpolicy="no-referrer" draggable="false">` : ""}<span class="ui-detail-modal-avatar-fallback" data-avatar-fallback="true">${escapeHtml(presentation.initials)}</span></div></div>`;
}

function statusChip(tech = {}) {
  const active = statusLabel(tech.status) === "Activo";
  const modifier = active
    ? "incidencias-status-chip--resolved"
    : "incidencias-priority-badge--critical";
  return `<span class="ui-detail-modal-chip ${modifier}">${active ? "Activo" : "Inactivo"}</span>`;
}

function ticketStatusChip(ticket = {}) {
  const label = ticketStatusLabel(ticket);
  const modifier = label === "Resuelta"
    ? "incidencias-status-chip--resolved"
    : label === "Pendiente"
      ? "incidencias-status-chip--pending"
      : "incidencias-status-chip--open";
  return `<span class="ui-detail-modal-chip ${modifier}">${escapeHtml(label)}</span>`;
}

function priorityChip(ticket = {}) {
  const label = priorityLabel(ticket);
  const modifier = label === "Urgente"
    ? "incidencias-priority-badge--critical"
    : label === "Alta"
      ? "incidencias-priority-badge--high"
      : "";
  return `<span class="ui-detail-modal-chip ${modifier}">${escapeHtml(label)}</span>`;
}

function progressRow(label = "", value = 0, detail = "", tone = "info") {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="inc-technician-progress" data-tone="${tone === "success" ? "success" : "info"}"><div class="inc-technician-progress-head"><span>${escapeHtml(label)}</span><strong>${escapeHtml(percentLabel(safe))}</strong></div><progress class="inc-technician-progress-meter" max="100" value="${safe.toFixed(2)}" aria-label="${attr(label)}"></progress>${detail ? `<span class="inc-technician-progress-detail">${escapeHtml(detail)}</span>` : ""}</div>`;
}

function ticketCard(ticket = {}, { resolved = false } = {}) {
  const id = ticketId(ticket) || "Incidencia";
  const subject = ticketTitle(ticket);
  const date = resolved ? ticketClosedAt(ticket) : ticketActivityAt(ticket);
  return `<article class="ui-detail-modal-meta-card inc-technician-ticket-card" data-ticket-id="${attr(id)}" data-ticket-resolved="${resolved ? "true" : "false"}"><span>${escapeHtml(id)}</span><strong title="${attr(subject)}">${escapeHtml(subject)}</strong><div class="ui-detail-modal-hero-chips">${ticketStatusChip(ticket)}${priorityChip(ticket)}</div><span class="inc-technician-ticket-date">${escapeHtml(dateTimeLabel(date, "Fecha no disponible"))}</span></article>`;
}

function renderPublicTrust(tech = {}, stats = {}) {
  const profile = publicTechnicianProfileFor(tech);
  if (!profile) return "";

  const feedback = stats.closed > 0
    ? `<strong>${numberLabel(stats.closed)} incidencia${stats.closed === 1 ? "" : "s"} resuelta${stats.closed === 1 ? "" : "s"} visible${stats.closed === 1 ? "" : "s"}.</strong> El historial de abajo te permite ver trabajo ya cerrado por este técnico dentro de los permisos de tu cuenta.`
    : `<strong>Este es tu técnico asignado.</strong> Cuando una incidencia quede resuelta aparecerá en el historial visible de abajo.`;

  return `<section class="ui-detail-modal-description-section" data-technician-public-profile="${attr(profile.id)}">${sectionHeader("Tu técnico", "Quién te atiende y cómo trabaja")}<div class="inc-technician-trust-card"><div class="inc-technician-trust-copy"><strong>${escapeHtml(profile.role)} · Onion Support</strong><p>${escapeHtml(profile.summary)}</p></div><div class="inc-technician-proof-grid"><div class="inc-technician-proof"><strong>${escapeHtml(profile.experienceValue)}</strong><span>${escapeHtml(profile.experienceLabel)}</span></div><div class="inc-technician-proof"><strong>${escapeHtml(profile.clientsValue)}</strong><span>${escapeHtml(profile.clientsLabel)}</span></div></div></div><div class="inc-technician-method-grid">${profile.method.map((step) => `<div class="inc-technician-method-item"><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.text)}</span></div>`).join("")}</div><div class="inc-technician-feedback">${feedback}</div></section>`;
}

function renderLoading(seed = {}) {
  const tech = mergeTechnician(seed, {});
  return renderShell({
    tech,
    summary: "Cargando perfil y actividad visible…",
    body: `<section class="ui-detail-modal-description-section" aria-busy="true">${sectionHeader("Preparando perfil", "Sin modificar ningún dato")}<div class="ui-detail-modal-meta-grid">${metaCard("Perfil", "Cargando…")}${metaCard("Incidencias", "Buscando…")}${metaCard("Resueltas", "Buscando…")}${metaCard("Contacto", "Validando…")}</div></section>`,
  });
}

function renderError(seed = {}, message = "") {
  const tech = mergeTechnician(seed, {});
  return renderShell({
    tech,
    summary: "Perfil parcialmente disponible",
    body: `<section class="ui-detail-modal-description-section" role="alert">${sectionHeader("No se pudo completar el perfil", "La incidencia no se ha modificado")}<p class="inc-technician-empty">${escapeHtml(message || "No se pudo cargar la información del técnico.")}</p></section>`,
  });
}

function renderProfile(tech = {}, stats = {}) {
  const profile = publicTechnicianProfileFor(tech);
  const email = normalizeEmail(tech.email);
  const phone = text(tech.phone, "");
  const dialPhone = phone.replace(/[^+\d]/g, "");
  const roleLabel = text(first(tech.publicRole, profile?.role, displayLabel(tech.role, "Técnico")), "Técnico");
  const recent = array(stats.recent);
  const resolvedRecent = array(stats.resolvedRecent);
  const scopeLabel = stats.exact
    ? `${numberLabel(stats.assigned)} incidencias en el historial accesible`
    : `${numberLabel(stats.assigned)} incidencias visibles en la muestra accesible`;
  const historyHint = stats.partial
    ? "La API ha devuelto una ventana parcial; no se presentan estos datos como histórico total."
    : "El historial respeta exactamente los permisos de la sesión actual.";

  const body = `
    ${renderPublicTrust(tech, stats)}

    <section class="ui-detail-modal-description-section">
      ${sectionHeader("Resumen operativo", scopeLabel)}
      <div class="ui-detail-modal-meta-grid">
        ${metaCard("Visibles", numberLabel(stats.assigned), stats.exact ? "Historial accesible" : "Ventana cargada")}
        ${metaCard("Activas", numberLabel(stats.active), stats.active ? "Requieren seguimiento" : "Sin pendientes activas")}
        ${metaCard("Resueltas", numberLabel(stats.closed), "Cerradas o resueltas visibles")}
        ${metaCard("Urgentes", numberLabel(stats.urgent), stats.urgent ? "Prioridad alta o crítica" : "Sin urgencias activas")}
      </div>
      <div class="inc-technician-progress-grid">
        ${progressRow("Resolución en historial visible", stats.resolutionRate, `${numberLabel(stats.closed)} de ${numberLabel(stats.assigned)} visibles resueltas`, "success")}
        ${progressRow("Carga activa visible", stats.activeRate, `${numberLabel(stats.active)} en seguimiento`, "info")}
      </div>
      <p class="inc-technician-section-copy">${escapeHtml(historyHint)}</p>
    </section>

    <section class="ui-detail-modal-contact-section">
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
    </section>

    <section class="ui-detail-modal-history-section" data-technician-resolved-history="true">
      ${sectionHeader("Incidencias resueltas", resolvedRecent.length ? `${numberLabel(resolvedRecent.length)} cierres recientes visibles` : "Sin cierres visibles todavía")}
      ${resolvedRecent.length ? `<div class="inc-technician-ticket-grid">${resolvedRecent.map((ticket) => ticketCard(ticket, { resolved: true })).join("")}</div>` : `<p class="inc-technician-empty">Todavía no hay incidencias resueltas visibles para este técnico en el ámbito de tu cuenta.</p>`}
    </section>

    <section class="ui-detail-modal-history-section">
      ${sectionHeader("Actividad reciente", recent.length ? `${numberLabel(recent.length)} últimas incidencias visibles` : "Sin actividad reciente")}
      ${recent.length ? `<div class="inc-technician-ticket-grid">${recent.map((ticket) => ticketCard(ticket)).join("")}</div>` : `<p class="inc-technician-empty">No hay actividad reciente disponible para este técnico.</p>`}
    </section>`;

  const summary = stats.closed > 0
    ? `${numberLabel(stats.active)} activa${stats.active === 1 ? "" : "s"} · ${numberLabel(stats.closed)} resuelta${stats.closed === 1 ? "" : "s"} visible${stats.closed === 1 ? "" : "s"}`
    : `${numberLabel(stats.active)} incidencia${stats.active === 1 ? "" : "s"} activa${stats.active === 1 ? "" : "s"} · seguimiento en curso`;

  return renderShell({ tech, body, summary });
}

function renderShell({ tech = {}, body = "", summary = "" } = {}) {
  const name = text(tech.name, "Técnico");
  const profile = publicTechnicianProfileFor(tech);
  const role = text(first(tech.publicRole, profile?.role, displayLabel(tech.role, "Técnico")), "Técnico");
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

function decoratePriorityBadges(root = mountRoot) {
  for (const badge of root?.querySelectorAll?.(PRIORITY_BADGE) || []) {
    const label = text(badge.textContent, "");
    badge.classList.add("incidencias-meta-pill--action");
    if (label) badge.title = `Prioridad: ${label}`;
  }
}

function decorateDetailPriorityChips(root = observedModalHost) {
  for (const chip of root?.querySelectorAll?.(DETAIL_PRIORITY) || []) {
    const label = text(chip.textContent, "");
    chip.classList.add("incidencias-meta-pill--action");
    if (label) chip.title = `Prioridad: ${label}`;
  }
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
  decoratePriorityBadges();
  decorateTechnicianBadges();
  decorateDetailPriorityChips();
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
    let sourceTicket = null;
    let snapshot = seed;

    try {
      sourceTicket = await api.loadIncidenciaDetail(id, {
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
      /* El perfil puede continuar con la identidad del trigger. */
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
        user = null;
      }
    }

    if (sequence !== requestSeq) return false;

    const tech = mergeTechnician(snapshot, user || {});
    const history = await loadTechnicianHistory(api, tech, sourceTicket);

    if (sequence !== requestSeq) return false;
    paint(renderProfile(tech, history));
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
    historyAuthority: "role-scoped-incidencias-api",
    resolvedHistory: true,
    canonicalPublicProfile: true,
    syntheticRatings: false,
    clientSafeProfileFields: true,
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

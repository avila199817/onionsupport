/* =========================================================
   Onion Support · Incidencias Detail State
   Archivo: /src/features/incidencias-detail-state/index.js

   Única autoridad de presentación progresiva del Modal Details:
   - turno de usuario pendiente de revisión;
   - composer fail-closed hasta confirmar política remota;
   - lease de modal estable entre navegaciones SPA;
   - seguimiento y adjuntos más recientes primero;
   - indicador accesible de turno pendiente;
   - ID completo y affordance del técnico.

   El backend sigue siendo la autoridad de permisos y escrituras.
   CLOSED no bloquea por sí mismo una actualización futura.
========================================================= */

import { synchronizeAvatars } from "../avatar-system/index.js";

export const INCIDENCIAS_DETAIL_STATE_VERSION =
  "incidencias-detail-state.v5.route-lease-authoritative";

const HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const ADMIN = "[data-modal-admin-editor='true']";
const COMPOSER = "[data-modal-composer='true']";
const HEADER_CHIPS =
  "[data-modal-header-chips='true'], .ui-detail-modal-hero-chips";
const PENDING_CHIP = "[data-ticket-review-state='pending']";
const SUCCESS = ".incidencias-modal-feedback--success";
const ERROR = ".incidencias-modal-feedback--error";
const DESCRIPTION_SECTION = ".incidencias-modal-description-section";
const DESCRIPTION_TEXT = ".incidencias-modal-description";
const COMMENT_THREAD = "[data-description-comments='true']";
const COMMENTS = ".incidencias-modal-description-comments";
const FILES = ".incidencias-modal-attachments-grid";
const FILE = ".incidencias-modal-attachment-card[data-attachment-id]";
const ID_CHIP = ".incidencias-modal-id-chip[data-ticket-id]";
const ID_TEXT = ".incidencias-modal-id-chip-text";
const TECH_CARD =
  ".incidencias-modal-technician-card[data-technician-profile-trigger='true']";
const TECH_INLINE =
  ".incidencias-modal-technician-inline[data-technician-assigned='true']";
const TECH_EYE = "[data-technician-profile-eye='true']";

const POLL_MS = 90_000;
const RETRY_MS = 30_000;

const PENDING_TITLE = "Pendiente de revisión";
const PENDING_MESSAGE =
  "Tu última actualización está pendiente de revisión. Podrás volver a actualizar esta incidencia cuando el equipo de soporte responda.";
const BACKEND_WAITING_MESSAGE =
  "Ya has enviado una actualización. Podrás iniciar otra cuando el equipo de soporte responda en esta incidencia.";

const SUPPORT_ROLES = new Set([
  "admin",
  "support",
  "technician",
  "tecnico",
  "agent",
  "staff",
]);

const USER_ROLES = new Set([
  "user",
  "standard",
  "client",
  "cliente",
  "customer",
  "requester",
]);

const SUPPORT_SOURCES = new Set([
  "support",
  "admin",
  "technician",
  "tecnico",
  "agent",
  "staff",
]);

const USER_SOURCES = new Set([
  "user",
  "client",
  "cliente",
  "customer",
  "requester",
]);

const COMMENT_FIELDS = new Set([
  "comments",
  "comment",
  "comentarios",
  "comentario",
]);

const ATTACHMENT_FIELDS = new Set([
  "attachments",
  "attachment",
  "adjuntos",
  "adjunto",
  "files",
  "file",
]);

let mounted = false;
let mountRoot = null;
let host = null;
let hostLeaseObserver = null;
let modalObserver = null;
let frame = 0;
let pollTimer = 0;
let requestSeq = 0;
let requestController = null;
let hydration = null;
let activeRoot = null;
let activeTicketId = "";
let lastSuccessKey = "";
let internalMutations = 0;
let apiPromise = null;

const detachedComposers = new WeakMap();

const browser = () =>
  typeof window !== "undefined" &&
  typeof document !== "undefined";

const text = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

const multiline = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim() || fallback;

const lower = (value = "") =>
  text(value).toLowerCase();

const object = (value, fallback = {}) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;

const array = (value) =>
  Array.isArray(value)
    ? value
    : [];

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
    ) {
      continue;
    }
    return value;
  }

  return null;
}

function timestamp(value = null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }

  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventTime(entry = {}) {
  const raw = object(entry);

  return Math.max(
    timestamp(raw.createdAt),
    timestamp(raw.updatedAt),
    timestamp(raw.uploadedAt),
    timestamp(raw.date),
    timestamp(raw.timestamp),
    timestamp(raw.at)
  );
}

function currentRoot() {
  return host?.querySelector?.(ROOT) || null;
}

function ticketId(root = currentRoot()) {
  return text(
    first(
      root?.dataset?.ticketId,
      root?.dataset?.incidenciaId
    ),
    ""
  );
}

const api = () =>
  apiPromise ||= import("../../views/incidencias/incidencias.api.js");

function ownMutation(callback) {
  internalMutations += 1;

  try {
    return callback();
  } finally {
    queueMicrotask(() => {
      internalMutations = Math.max(0, internalMutations - 1);
    });
  }
}

function supportIdentity(detail = {}) {
  const raw = object(first(detail?.raw, detail));
  const assignment = object(raw.assignment);
  const technician = object(assignment.technician);
  const assignedTo = object(raw.assignedTo);
  const tecnico = object(raw.tecnico);
  const meta = object(raw.meta);

  return {
    ids: new Set([
      raw.assignedToUserId,
      raw.technicianUserId,
      assignment.assignedToUserId,
      assignment.technicianUserId,
      technician.userId,
      technician.id,
      assignedTo.userId,
      assignedTo.id,
      tecnico.userId,
      tecnico.id,
      meta.technicianUserId,
      meta.lastTechnicianUserId,
    ].map(text).filter(Boolean)),

    emails: new Set([
      raw.assignedToEmail,
      raw.technicianEmail,
      assignment.assignedToEmail,
      assignment.technicianEmail,
      technician.email,
      assignedTo.email,
      tecnico.email,
      meta.technicianEmail,
      meta.lastTechnicianEmail,
    ].map(lower).filter(Boolean)),
  };
}

function requesterIdentity(detail = {}) {
  const raw = object(first(detail?.raw, detail));
  const createdBy = object(raw.createdBy);
  const receptor = object(raw.receptor);
  const requester = object(raw.requesterSnapshot);
  const usuario = object(raw.usuario);
  const owner = object(raw.owner);
  const cliente = object(raw.cliente);

  return {
    ids: new Set([
      raw.userId,
      raw.usuarioId,
      raw.ownerUserId,
      raw.createdByUserId,
      raw.receptorUserId,
      raw.requesterUserId,
      createdBy.userId,
      createdBy.id,
      receptor.userId,
      receptor.id,
      requester.userId,
      requester.id,
      usuario.userId,
      usuario.id,
      owner.userId,
      owner.id,
      cliente.userId,
    ].map(text).filter(Boolean)),

    emails: new Set([
      raw.email,
      raw.emailLower,
      raw.userEmail,
      raw.clienteEmail,
      raw.requesterEmail,
      createdBy.email,
      receptor.email,
      requester.email,
      requester.emailLower,
      usuario.email,
      owner.email,
      cliente.email,
      cliente.emailLower,
    ].map(lower).filter(Boolean)),
  };
}

function eventSide(entry = {}, detail = {}) {
  const raw = object(entry);
  const source = lower(raw.source || raw.origin || raw.actorType);

  if (SUPPORT_SOURCES.has(source)) return "support";
  if (USER_SOURCES.has(source)) return "user";

  const role = lower(
    raw.role ||
    raw.rol ||
    raw.actorRole ||
    raw.by?.role ||
    raw.createdBy?.role ||
    raw.uploadedBy?.role
  );

  if (SUPPORT_ROLES.has(role)) return "support";
  if (USER_ROLES.has(role)) return "user";

  const actorId = text(
    raw.byUserId ||
    raw.userId ||
    raw.actorUserId ||
    raw.by?.userId ||
    raw.createdBy?.userId ||
    raw.uploadedBy?.userId
  );

  const actorEmail = lower(
    raw.byEmail ||
    raw.email ||
    raw.actorEmail ||
    raw.by?.email ||
    raw.createdBy?.email ||
    raw.uploadedBy?.email
  );

  const support = supportIdentity(detail);
  if (actorId && support.ids.has(actorId)) return "support";
  if (actorEmail && support.emails.has(actorEmail)) return "support";

  const requester = requesterIdentity(detail);
  if (actorId && requester.ids.has(actorId)) return "user";
  if (actorEmail && requester.emails.has(actorEmail)) return "user";

  return "";
}

function historyKinds(entry = {}) {
  const raw = object(entry);
  const kinds = new Set();

  for (const change of array(raw.changes)) {
    const item = object(change);
    const action = lower(item.action || "add");

    if (!["add", "create", "created", "upload", "uploaded"].includes(action)) {
      continue;
    }

    const field = lower(item.field || item.type || item.kind);
    if (COMMENT_FIELDS.has(field)) kinds.add("comment");
    if (ATTACHMENT_FIELDS.has(field)) kinds.add("attachment");
  }

  const type = lower(raw.kind || raw.type || raw.action || raw.event);

  if (["comment", "comentario", "comment_added"].includes(type)) {
    kinds.add("comment");
  }

  if (
    [
      "attachments_added",
      "attachment_added",
      "attachment_uploaded",
    ].includes(type)
  ) {
    kinds.add("attachment");
  }

  return kinds;
}

function updateConversationClock(
  clocks,
  entry,
  detail,
  {
    requireConversationKind = false,
  } = {}
) {
  if (requireConversationKind && !historyKinds(entry).size) {
    return false;
  }

  const at = eventTime(entry);
  if (!at) return false;

  const side = eventSide(entry, detail);
  if (side === "user") clocks.user = Math.max(clocks.user, at);
  if (side === "support") clocks.support = Math.max(clocks.support, at);

  return Boolean(side);
}

export function resolveConversationPolicy(detail = {}) {
  const raw = object(first(detail?.raw, detail));
  const explicit = object(
    first(
      detail?.userUpdatePolicy,
      detail?.meta?.userUpdatePolicy,
      raw.userUpdatePolicy,
      raw.meta?.userUpdatePolicy,
      {}
    )
  );

  const hasBackendAwaiting =
    typeof explicit.awaitingSupportResponse === "boolean";
  const hasBackendCanUpdate =
    typeof explicit.canUserUpdate === "boolean";

  if (hasBackendAwaiting || hasBackendCanUpdate) {
    const awaitingSupportResponse =
      explicit.awaitingSupportResponse === true;
    const canUserUpdate = hasBackendCanUpdate
      ? explicit.canUserUpdate === true
      : !awaitingSupportResponse;

    return {
      awaitingSupportResponse,
      canUserUpdate,
      blocked:
        awaitingSupportResponse || !canUserUpdate,
      lastUserUpdateAt:
        explicit.lastUserUpdateAt || null,
      lastSupportResponseAt:
        explicit.lastSupportResponseAt || null,
      message:
        text(explicit.message, ""),
      source: "backend",
    };
  }

  const clocks = {
    user: 0,
    support: 0,
  };

  for (const comment of array(first(detail?.comments, raw.comments, []))) {
    updateConversationClock(clocks, comment, raw);
  }

  for (const entry of array(first(detail?.history, raw.history, []))) {
    updateConversationClock(
      clocks,
      entry,
      raw,
      { requireConversationKind: true }
    );
  }

  /*
    El contrato de detalle puede materializar la conversación exclusivamente
    en timeline[]. No depender de que comments/history se dupliquen evita que
    una nueva navegación pueda inferir falsamente que el turno está libre.
  */
  for (const entry of array(first(detail?.timeline, raw.timeline, []))) {
    updateConversationClock(
      clocks,
      entry,
      raw,
      { requireConversationKind: true }
    );
  }

  const awaitingSupportResponse =
    clocks.user > clocks.support;

  return {
    awaitingSupportResponse,
    canUserUpdate: !awaitingSupportResponse,
    blocked: awaitingSupportResponse,
    lastUserUpdateAt:
      clocks.user
        ? new Date(clocks.user).toISOString()
        : null,
    lastSupportResponseAt:
      clocks.support
        ? new Date(clocks.support).toISOString()
        : null,
    message: "",
    source: "history",
  };
}

function normalizeComment(item = {}, index = 0) {
  const raw = object(item);
  const type = lower(
    first(raw.kind, raw.type, raw.action, raw.event, "comment")
  );

  if (type && !["comment", "comentario"].includes(type)) {
    return null;
  }

  const body = multiline(
    first(
      raw.body,
      raw.message,
      raw.text,
      raw.comment,
      raw.description,
      raw.descripcion,
      raw.summary
    ),
    ""
  );

  if (!body) return null;

  return {
    id: text(
      first(raw.id, raw.commentId, raw.eventId, `comment_${index}`),
      `comment_${index}`
    ),
    body,
    author: text(
      first(
        raw.author,
        raw.byName,
        raw.createdByName,
        raw.userName,
        raw.name,
        raw.by?.name,
        raw.createdBy?.name,
        raw.role
      ),
      "Usuario"
    ),
    createdAt: first(
      raw.createdAt,
      raw.date,
      raw.timestamp,
      raw.updatedAt,
      null
    ),
    sourceIndex: index,
  };
}

function commentsFromDetail(detail = {}) {
  const raw = object(first(detail?.raw, detail?.data, detail?.item, detail));
  const timeline = array(first(detail?.timeline, raw.timeline, []));

  const source = timeline.length
    ? timeline.filter((entry) =>
        ["comment", "comentario"].includes(
          lower(
            first(
              entry?.kind,
              entry?.type,
              entry?.action,
              entry?.event,
              ""
            )
          )
        )
      )
    : array(
        first(
          detail?.comments,
          detail?.notes,
          detail?.messages,
          raw.comments,
          raw.notes,
          raw.messages,
          []
        )
      );

  return source
    .map(normalizeComment)
    .filter(Boolean)
    .sort((a, b) =>
      timestamp(b.createdAt) - timestamp(a.createdAt) ||
      b.sourceIndex - a.sourceIndex
    );
}

function formatDate(value = null) {
  const at = timestamp(value);
  if (!at) return "Fecha no disponible";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(at));
  } catch {
    return "Fecha no disponible";
  }
}

function commentSignature(comments = []) {
  return comments
    .map((comment) =>
      [comment.id, comment.body, timestamp(comment.createdAt)].join("::")
    )
    .join("||");
}

function buildCommentCard(comment = {}) {
  const article = document.createElement("article");
  article.className = "incidencias-modal-description-comment";
  article.dataset.descriptionComment = "true";

  const accent = document.createElement("span");
  accent.className = "incidencias-modal-description-comment-accent";
  accent.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "incidencias-modal-description-comment-content";

  const head = document.createElement("div");
  head.className = "incidencias-modal-description-comment-head";

  const author = document.createElement("strong");
  author.textContent = text(comment.author, "Usuario");

  const date = document.createElement("span");
  date.className = "incidencias-modal-description-comment-date";
  date.textContent = formatDate(comment.createdAt);

  const body = document.createElement("p");
  body.textContent = multiline(
    comment.body,
    "Actualización registrada."
  );

  head.append(author, date);
  content.append(head, body);
  article.append(accent, content);

  return article;
}

function renderComments(root, detail = {}) {
  const section = root?.querySelector?.(DESCRIPTION_SECTION);
  const description = section?.querySelector?.(DESCRIPTION_TEXT);

  if (!section || !description) return false;

  const comments = commentsFromDetail(detail);
  const signature = commentSignature(comments);
  let thread = section.querySelector(COMMENT_THREAD);

  if (!comments.length) {
    if (thread) ownMutation(() => thread.remove());
    section.dataset.hasDescriptionComments = "false";
    return true;
  }

  if (thread?.dataset?.commentSignature === signature) {
    section.dataset.hasDescriptionComments = "true";
    return true;
  }

  ownMutation(() => {
    if (!thread) {
      thread = document.createElement("section");
      thread.className = "incidencias-modal-description-thread";
      thread.dataset.descriptionComments = "true";
      thread.setAttribute(
        "aria-label",
        "Comentarios y seguimiento de la incidencia"
      );
      description.insertAdjacentElement("afterend", thread);
    }

    thread.dataset.commentSignature = signature;
    thread.replaceChildren();

    const head = document.createElement("div");
    head.className = "incidencias-modal-description-thread-head";

    const title = document.createElement("strong");
    title.textContent = "Seguimiento";

    const count = document.createElement("span");
    count.textContent =
      `${comments.length} comentario${comments.length === 1 ? "" : "s"}`;

    const list = document.createElement("div");
    list.className = COMMENTS.slice(1);

    for (const comment of comments) {
      list.appendChild(buildCommentCard(comment));
    }

    head.append(title, count);
    thread.append(head, list);
  });

  section.dataset.hasDescriptionComments = "true";
  return true;
}

function attachmentId(file = {}, index = 0) {
  return text(
    first(
      file?.id,
      file?.attachmentId,
      file?.fileId,
      file?.storageKey,
      file?.path,
      file?.blobPath,
      file?.blobName,
      `att_${index}`
    ),
    `att_${index}`
  );
}

function sortAttachments(root, detail = {}) {
  const grid = root?.querySelector?.(FILES);
  if (!grid) return false;

  const cards = Array.from(
    grid.querySelectorAll(`:scope > ${FILE}`)
  );
  if (cards.length < 2) return true;

  const raw = object(first(detail?.raw, detail));
  const files = array(
    first(
      detail?.attachments,
      detail?.files,
      detail?.adjuntos,
      raw.attachments,
      raw.files,
      raw.adjuntos,
      []
    )
  );

  const times = new Map(
    files.map((file, index) => [
      attachmentId(file, index),
      Math.max(
        timestamp(file?.uploadedAt),
        timestamp(file?.createdAt),
        timestamp(file?.updatedAt),
        timestamp(file?.date)
      ),
    ])
  );

  const ranked = cards.map((card, index) => ({
    card,
    index,
    time: times.get(text(card.dataset?.attachmentId)) || 0,
  }));

  const desired = [...ranked].sort((a, b) =>
    b.time - a.time || b.index - a.index
  );

  if (!desired.some((entry, index) => entry.card !== cards[index])) {
    return true;
  }

  ownMutation(() => {
    for (const entry of desired) {
      grid.appendChild(entry.card);
    }
  });

  return true;
}

function hideComposer(root) {
  if (!root || root.querySelector(ADMIN)) return false;

  const state = detachedComposers.get(root);
  if (state?.marker?.isConnected && !state.composer?.isConnected) {
    return true;
  }

  const composer = root.querySelector(COMPOSER);
  if (!composer?.parentNode) return false;

  const marker = document.createComment("onion-detail-state-composer");

  ownMutation(() => {
    composer.replaceWith(marker);
  });

  detachedComposers.set(root, { marker, composer });
  return true;
}

function showComposer(root) {
  if (!root) return false;
  if (root.querySelector(ADMIN)) {
    return Boolean(root.querySelector(COMPOSER));
  }

  const state = detachedComposers.get(root);

  if (!state) {
    return Boolean(root.querySelector(COMPOSER));
  }

  if (state.marker?.isConnected && !state.composer?.isConnected) {
    ownMutation(() => {
      state.marker.replaceWith(state.composer);
    });
  }

  detachedComposers.delete(root);
  return true;
}

function ensurePendingChip(root, policy = {}) {
  if (!root || root.querySelector(ADMIN)) return false;

  const chips = root.querySelector(HEADER_CHIPS);
  if (!chips) return false;

  let chip = chips.querySelector(PENDING_CHIP);

  if (!chip) {
    ownMutation(() => {
      chip = document.createElement("span");
      chip.className = [
        "incidencias-modal-chip",
        "ui-detail-modal-chip",
        "incidencias-modal-chip--status-pending",
        "ui-detail-modal-chip--status-pending",
        "incidencias-modal-review-chip",
      ].join(" ");
      chip.dataset.ticketReviewState = "pending";

      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "◷";

      const label = document.createElement("span");
      label.textContent = PENDING_TITLE;

      chip.append(icon, label);
      chips.appendChild(chip);
    });
  }

  const message = text(policy?.message, PENDING_MESSAGE);
  chip.title = message;
  chip.setAttribute(
    "aria-label",
    `${PENDING_TITLE}. ${message}`
  );

  return true;
}

function removePendingChip(root) {
  const chip = root?.querySelector?.(PENDING_CHIP);
  if (!chip) return false;

  ownMutation(() => chip.remove());
  return true;
}

function syncTicketId(root) {
  const chip = root?.querySelector?.(ID_CHIP);
  const label = chip?.querySelector?.(ID_TEXT);
  const id = text(chip?.dataset?.ticketId, "");

  if (!chip || !label || !id) return false;

  if (label.textContent !== id) {
    ownMutation(() => {
      label.textContent = id;
    });
  }

  chip.dataset.fullTicketIdVisible = "true";
  chip.title = `Copiar ID: ${id}`;
  return true;
}

function syncTechnicianEye(root) {
  const card = root?.querySelector?.(TECH_CARD);
  const inline = card?.querySelector?.(TECH_INLINE);

  if (!card || !inline) return false;

  const name = text(
    inline.querySelector?.("strong")?.textContent,
    "Técnico"
  );

  const label = `Ver perfil de ${name}`;
  card.title = label;
  card.setAttribute("aria-label", label);

  const eye = card.querySelector(TECH_EYE);

  if (eye) {
    eye.classList.add("incidencias-modal-technician-eye");
    eye.title = label;
  }

  return true;
}

function project(root, detail = {}) {
  if (!root?.isConnected) return false;

  const policy = resolveConversationPolicy(detail);
  const admin = Boolean(root.querySelector(ADMIN));

  if (admin) {
    showComposer(root);
    removePendingChip(root);
  } else if (policy.blocked) {
    hideComposer(root);
    ensurePendingChip(root, policy);
  } else {
    showComposer(root);
    removePendingChip(root);
  }

  root.dataset.ticketReviewState =
    !admin && policy.blocked
      ? "pending"
      : "ready";

  renderComments(root, detail);
  sortAttachments(root, detail);
  syncTicketId(root);
  syncTechnicianEye(root);
  synchronizeAvatars(root);

  return true;
}

function clearPoll() {
  if (!pollTimer || !browser()) return false;

  window.clearTimeout(pollTimer);
  pollTimer = 0;
  return true;
}

function planPoll(id, detail = null, delay = POLL_MS) {
  clearPoll();

  if (!browser() || !id) return false;

  if (detail) {
    const policy = resolveConversationPolicy(detail);
    if (!policy.blocked) return false;
  }

  pollTimer = window.setTimeout(() => {
    pollTimer = 0;

    const root = currentRoot();
    if (root && ticketId(root) === id) {
      hydrate(id, { force: true });
    }
  }, Math.max(1_000, Number(delay) || POLL_MS));

  return true;
}

function abortHydration() {
  requestSeq += 1;

  try {
    requestController?.abort?.();
  } catch {
    // noop
  }

  requestController = null;

  if (hydration) {
    hydration.inFlight = null;
  }

  return true;
}

function clearActiveState({ clearHydration = true } = {}) {
  clearPoll();
  activeRoot = null;
  activeTicketId = "";
  lastSuccessKey = "";

  if (clearHydration) {
    abortHydration();
    hydration = null;
  }

  return true;
}

function hydrate(id, { force = false } = {}) {
  const cleanId = text(id, "");
  if (!cleanId) return null;

  if (
    !force &&
    hydration?.ticketId === cleanId &&
    hydration?.inFlight
  ) {
    return hydration;
  }

  if (force) {
    abortHydration();
  }

  const sequence = ++requestSeq;
  const controller =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  requestController = controller;

  const current = {
    ticketId: cleanId,
    sequence,
    resolved: false,
    stable: false,
    detail:
      !force && hydration?.ticketId === cleanId
        ? hydration.detail
        : null,
    error: null,
    inFlight: null,
  };

  const task = (async () => {
    try {
      const source = await api();
      const detail = await source.loadIncidenciaDetail(cleanId, {
        force: true,
        forceRefresh: true,
        cache: false,
        noCache: true,
        signal: controller?.signal,
      });

      if (
        sequence !== requestSeq ||
        hydration !== current
      ) {
        return null;
      }

      current.detail = detail || null;
      current.resolved = true;
      current.stable = Boolean(detail);
      current.error = null;

      if (current.detail) {
        planPoll(cleanId, current.detail);
      } else {
        planPoll(cleanId, null, RETRY_MS);
      }

      return current.detail;
    } catch (error) {
      if (
        sequence === requestSeq &&
        hydration === current &&
        error?.name !== "AbortError"
      ) {
        current.error = error;
        current.resolved = true;
        current.stable = false;
        planPoll(cleanId, null, RETRY_MS);
      }

      return null;
    } finally {
      if (
        sequence === requestSeq &&
        hydration === current
      ) {
        current.inFlight = null;
        requestController = null;
        schedule();
      }
    }
  })();

  current.inFlight = task;
  hydration = current;
  return current;
}

function refreshAfterSuccess(root) {
  const success = root?.querySelector?.(SUCCESS);
  const id = ticketId(root);

  if (!success || !id) return false;

  const key = `${id}::${text(success.textContent)}`;

  if (!key || key === lastSuccessKey) {
    return false;
  }

  lastSuccessKey = key;
  hydrate(id, { force: true });
  return true;
}

function refreshAfterBlockedError(root) {
  if (!root || root.querySelector(ADMIN)) return false;

  const feedback = root.querySelector(ERROR);
  const message = lower(feedback?.textContent);
  const expected = lower(BACKEND_WAITING_MESSAGE);

  if (
    !message ||
    !(
      message.includes(expected) ||
      (
        message.includes("ya has enviado una actualización") &&
        message.includes("equipo de soporte responda")
      )
    )
  ) {
    return false;
  }

  const id = ticketId(root);
  const currentDetail = object(hydration?.detail, {});
  const currentPolicy = object(
    first(
      currentDetail.userUpdatePolicy,
      currentDetail.meta?.userUpdatePolicy,
      {}
    )
  );

  const policy = {
    ...currentPolicy,
    awaitingSupportResponse: true,
    canUserUpdate: false,
    canUserAddComment: false,
    canUserAddAttachment: false,
    message: BACKEND_WAITING_MESSAGE,
    source: "backend-rejection",
  };

  const nextDetail = {
    ...currentDetail,
    userUpdatePolicy: policy,
    meta: {
      ...object(currentDetail.meta, {}),
      userUpdatePolicy: policy,
    },
  };

  if (hydration?.ticketId === id) {
    hydration.detail = nextDetail;
    hydration.resolved = true;
    hydration.stable = true;
  } else if (id) {
    hydration = {
      ticketId: id,
      sequence: requestSeq,
      resolved: true,
      stable: true,
      detail: nextDetail,
      error: null,
      inFlight: null,
    };
  }

  project(root, nextDetail);
  if (id) planPoll(id, nextDetail);
  return true;
}

function isElement(node) {
  return Boolean(
    node &&
    node.nodeType === 1 &&
    typeof node.matches === "function"
  );
}

function nodeTouches(node, selectors = []) {
  if (!isElement(node)) return false;

  return selectors.some((selector) =>
    node.matches?.(selector) ||
    node.querySelector?.(selector)
  );
}

function modalMutationMatters(mutations = []) {
  if (internalMutations > 0) return false;

  const selectors = [
    ROOT,
    SUCCESS,
    ERROR,
    FILES,
    HEADER_CHIPS,
  ];

  for (const mutation of mutations) {
    if (
      mutation.type === "attributes" &&
      mutation.attributeName === "data-submitting"
    ) {
      return true;
    }

    for (const node of [
      ...mutation.addedNodes,
      ...mutation.removedNodes,
    ]) {
      if (nodeTouches(node, selectors)) {
        return true;
      }
    }
  }

  return false;
}

function resetForHostLease(nextHost = null) {
  modalObserver?.disconnect?.();
  modalObserver = null;

  clearActiveState({ clearHydration: true });
  host = nextHost || null;

  if (host && typeof MutationObserver !== "undefined") {
    modalObserver = new MutationObserver((mutations) => {
      if (modalMutationMatters(mutations)) {
        schedule();
      }
    });

    modalObserver.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-submitting"],
    });
  }

  return Boolean(host);
}

function syncHostObserver() {
  const nextHost = document.querySelector(HOST);

  if (nextHost === host) {
    return Boolean(nextHost);
  }

  return resetForHostLease(nextHost);
}

function failClosed(root) {
  if (!root || root.querySelector(ADMIN)) return false;

  hideComposer(root);
  removePendingChip(root);
  root.dataset.ticketReviewState = "checking";
  return true;
}

function sync() {
  if (!browser() || !mounted) return false;

  syncHostObserver();

  const root = currentRoot();
  const id = ticketId(root);

  if (!root || !id) {
    if (activeRoot || activeTicketId || hydration) {
      clearActiveState({ clearHydration: true });
    }
    return false;
  }

  syncTicketId(root);
  syncTechnicianEye(root);
  synchronizeAvatars(root);

  if (activeRoot !== root || activeTicketId !== id) {
    clearPoll();
    activeRoot = root;
    activeTicketId = id;
    lastSuccessKey = "";

    if (!root.querySelector(ADMIN)) {
      failClosed(root);
      /*
        Cada root nuevo corresponde a una nueva apertura/lease. Se consulta de
        nuevo la autoridad remota incluso si es el mismo ticket que antes de
        navegar a Home. No se reutiliza una Promise resuelta de otra vista.
      */
      hydrate(id, { force: true });
    } else {
      root.dataset.ticketReviewState = "ready";
    }

    return true;
  }

  if (refreshAfterBlockedError(root)) {
    return true;
  }

  if (refreshAfterSuccess(root)) {
    return true;
  }

  if (root.querySelector(ADMIN)) {
    root.dataset.ticketReviewState = "ready";
    return true;
  }

  if (hydration?.ticketId === id && hydration?.detail) {
    return project(root, hydration.detail);
  }

  /*
    Mientras la autoridad no esté disponible, nunca reaparece el composer.
    Un error de red conserva el fail-closed y el retry programado.
  */
  failClosed(root);

  if (
    hydration?.ticketId !== id ||
    (!hydration?.inFlight && !hydration?.resolved)
  ) {
    hydrate(id, { force: true });
  }

  return true;
}

function schedule() {
  if (!browser() || !mounted || frame) return false;

  frame = window.requestAnimationFrame(() => {
    frame = 0;
    sync();
  });

  return true;
}

function hostLeaseMutationMatters(mutations = []) {
  for (const mutation of mutations) {
    if (mutation.type !== "childList") continue;

    for (const node of [
      ...mutation.addedNodes,
      ...mutation.removedNodes,
    ]) {
      if (nodeTouches(node, [HOST])) {
        return true;
      }
    }
  }

  return false;
}

export function mountIncidenciasDetailState() {
  if (!browser()) return false;
  if (mounted) return true;

  /*
    El modal host es una lease que index.js inserta como hijo DIRECTO de body,
    fuera de #view-container. Observar únicamente la vista dejaba ciego este
    feature después de Incidencias -> Home -> Incidencias.
  */
  mountRoot = document.body || null;
  if (!mountRoot) return false;

  mounted = true;

  if (typeof MutationObserver !== "undefined") {
    hostLeaseObserver = new MutationObserver((mutations) => {
      if (internalMutations > 0) return;

      if (hostLeaseMutationMatters(mutations)) {
        schedule();
      }
    });

    hostLeaseObserver.observe(mountRoot, {
      childList: true,
      subtree: false,
    });
  }

  schedule();
  return true;
}

export function destroyIncidenciasDetailState() {
  clearPoll();
  abortHydration();

  hostLeaseObserver?.disconnect?.();
  modalObserver?.disconnect?.();

  if (frame && browser()) {
    window.cancelAnimationFrame?.(frame);
  }

  mounted = false;
  mountRoot = null;
  host = null;
  hostLeaseObserver = null;
  modalObserver = null;
  frame = 0;
  hydration = null;
  activeRoot = null;
  activeTicketId = "";
  lastSuccessKey = "";
  internalMutations = 0;

  return true;
}

export function getIncidenciasDetailStateSnapshot() {
  const policy = hydration?.detail
    ? resolveConversationPolicy(hydration.detail)
    : null;

  return Object.freeze({
    version: INCIDENCIAS_DETAIL_STATE_VERSION,
    mounted,
    ticketId: activeTicketId,
    hydrated: Boolean(hydration?.detail),
    hydrating: Boolean(hydration?.inFlight),
    hostLeaseObserved: Boolean(hostLeaseObserver),
    policy: policy ? Object.freeze({ ...policy }) : null,
    ordering: Object.freeze({
      comments: "newest_first",
      attachments: "newest_first",
    }),
    pendingIndicator: "warning_clock_chip",
    composerPolicy: "fail_closed_until_backend_detail_policy",
    hostLeasePolicy: "body_direct_child_authoritative",
    newRootPolicy: "force_remote_revalidation",
    staleHydrationPolicy: "discard_on_modal_or_route_lease_change",
    timelineFallback: true,
    technicianAvatarFallback: "global_avatar_system",
    closedTicketCanReceiveFutureUpdate: true,
    backendIsWriteAuthority: true,
  });
}

if (browser()) {
  mountIncidenciasDetailState();
}

export default Object.freeze({
  version: INCIDENCIAS_DETAIL_STATE_VERSION,
  mount: mountIncidenciasDetailState,
  destroy: destroyIncidenciasDetailState,
  getSnapshot: getIncidenciasDetailStateSnapshot,
});
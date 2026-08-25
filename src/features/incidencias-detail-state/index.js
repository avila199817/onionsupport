/* =========================================================
   Onion Support · Incidencias Detail State
   Archivo: /src/features/incidencias-detail-state/index.js

   Única autoridad de presentación progresiva del Modal Details:
   - seguimiento: más reciente -> más antiguo
   - adjuntos actuales: más reciente -> más antiguo
   - turno de usuario pendiente de revisión
   - ocultación completa del composer mientras soporte no responde
   - indicador amarillo accesible con explicación del bloqueo
   - ID completo y affordance del técnico
   - coordinación segura del cierre durante la hidratación inicial

   El backend sigue siendo la autoridad de permisos y escrituras.
   El estado CLOSED no bloquea por sí mismo una actualización futura.
========================================================= */

export const INCIDENCIAS_DETAIL_STATE_VERSION =
  "incidencias-detail-state.v3.final-polish";

const VIEW = "#view-container, [data-router-view='true']";
const HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const ADMIN = "[data-modal-admin-editor='true']";
const COMPOSER = "[data-modal-composer='true']";
const HEADER_CHIPS = "[data-modal-header-chips='true'], .ui-detail-modal-hero-chips";
const PENDING_CHIP = "[data-ticket-review-state='pending']";
const SUCCESS = ".incidencias-modal-feedback--success";
const DESCRIPTION_SECTION = ".incidencias-modal-description-section";
const DESCRIPTION_TEXT = ".incidencias-modal-description";
const COMMENT_THREAD = "[data-description-comments='true']";
const COMMENTS = ".incidencias-modal-description-comments";
const FILES = ".incidencias-modal-attachments-grid";
const FILE = ".incidencias-modal-attachment-card[data-attachment-id]";
const ID_CHIP = ".incidencias-modal-id-chip[data-ticket-id]";
const ID_TEXT = ".incidencias-modal-id-chip-text";
const TECH_CARD = ".incidencias-modal-technician-card[data-technician-profile-trigger='true']";
const TECH_INLINE = ".incidencias-modal-technician-inline[data-technician-assigned='true']";
const TECH_EYE = "[data-technician-profile-eye='true']";
const TECH_AVATAR_FRAME = "[data-modal-technician-avatar-frame='true']";
const TECH_AVATAR_IMG = "[data-modal-technician-avatar-img='true']";
const POLL_MS = 90000;

const PENDING_TITLE = "Pendiente de revisión";
const PENDING_MESSAGE =
  "Tu última actualización está pendiente de revisión. Podrás volver a actualizar esta incidencia cuando el equipo de soporte responda.";

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
let viewObserver = null;
let modalObserver = null;
let frame = 0;
let pollTimer = 0;
let requestSeq = 0;
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
    return value < 100000000000
      ? value * 1000
      : value;
  }

  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed)
    ? parsed
    : 0;
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

  const identity = supportIdentity(detail);

  const actorId = text(
    raw.byUserId ||
    raw.userId ||
    raw.actorUserId ||
    raw.by?.userId ||
    raw.createdBy?.userId ||
    raw.uploadedBy?.userId
  );

  if (actorId && identity.ids.has(actorId)) {
    return "support";
  }

  const actorEmail = lower(
    raw.byEmail ||
    raw.email ||
    raw.actorEmail ||
    raw.by?.email ||
    raw.createdBy?.email ||
    raw.uploadedBy?.email
  );

  if (actorEmail && identity.emails.has(actorEmail)) {
    return "support";
  }

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

  if (["attachments_added", "attachment_added", "attachment_uploaded"].includes(type)) {
    kinds.add("attachment");
  }

  return kinds;
}

function resolveConversationPolicy(detail = {}) {
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

  if (typeof explicit.awaitingSupportResponse === "boolean") {
    return {
      awaitingSupportResponse:
        explicit.awaitingSupportResponse === true,
      lastUserUpdateAt:
        explicit.lastUserUpdateAt || null,
      lastSupportResponseAt:
        explicit.lastSupportResponseAt || null,
      source: "backend",
    };
  }

  let latestUser = 0;
  let latestSupport = 0;

  for (const comment of array(first(detail?.comments, raw.comments, []))) {
    const at = eventTime(comment);
    const side = eventSide(comment, raw);

    if (side === "user") latestUser = Math.max(latestUser, at);
    if (side === "support") latestSupport = Math.max(latestSupport, at);
  }

  for (const entry of array(first(detail?.history, raw.history, []))) {
    if (!historyKinds(entry).size) continue;

    const at = eventTime(entry);
    const side = eventSide(entry, raw);

    if (side === "user") latestUser = Math.max(latestUser, at);
    if (side === "support") latestSupport = Math.max(latestSupport, at);
  }

  return {
    awaitingSupportResponse:
      latestUser > latestSupport,
    lastUserUpdateAt:
      latestUser
        ? new Date(latestUser).toISOString()
        : null,
    lastSupportResponseAt:
      latestSupport
        ? new Date(latestSupport).toISOString()
        : null,
    source: "history",
  };
}

function normalizeComment(item = {}, index = 0) {
  const raw = object(item);
  const type = lower(first(raw.kind, raw.type, raw.action, raw.event, "comment"));

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

  let source = [];

  if (timeline.length) {
    source = timeline.filter((entry) =>
      ["comment", "comentario"].includes(
        lower(first(entry?.kind, entry?.type, entry?.action, entry?.event, ""))
      )
    );
  } else {
    source = array(
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
  }

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
  date.textContent = formatDate(comment.createdAt);

  const body = document.createElement("p");
  body.textContent = multiline(comment.body, "Actualización registrada.");

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
    list.className = "incidencias-modal-description-comments";

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

  const cards = Array.from(grid.querySelectorAll(`:scope > ${FILE}`));
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
    b.time - a.time ||
    b.index - a.index
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
  if (!root || root.querySelector(ADMIN)) return false;

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

function ensurePendingChip(root) {
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

  chip.title = PENDING_MESSAGE;
  chip.setAttribute(
    "aria-label",
    `${PENDING_TITLE}. ${PENDING_MESSAGE}`
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

function fallbackTechnicianAvatar(image) {
  const frame = image?.closest?.(TECH_AVATAR_FRAME) || null;
  if (!frame) return false;

  ownMutation(() => {
    frame.dataset.hasAvatar = "false";
    frame.dataset.fallback = "true";
    frame.classList.add("incidencias-modal-technician-avatar--fallback");
    image.remove();
  });

  return true;
}

function repairTechnicianAvatar(root) {
  if (!root) return false;

  let repaired = false;

  for (const image of Array.from(root.querySelectorAll?.(TECH_AVATAR_IMG) || [])) {
    if (image.complete && Number(image.naturalWidth || 0) === 0) {
      repaired = fallbackTechnicianAvatar(image) || repaired;
    }
  }

  return repaired;
}

function handleTechnicianAvatarError(event) {
  const image = event?.target;
  if (!image?.matches?.(TECH_AVATAR_IMG)) return;
  fallbackTechnicianAvatar(image);
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

  /*
     CLOSED nunca decide el composer. Sólo el turno conversacional pendiente.
     Una incidencia cerrada sin turno pendiente sigue siendo actualizable y el
     backend la reabre al recibir nueva información del propietario.
  */
  if (admin) {
    removePendingChip(root);
  } else if (policy.awaitingSupportResponse) {
    hideComposer(root);
    ensurePendingChip(root);
  } else {
    showComposer(root);
    removePendingChip(root);
  }

  root.dataset.ticketReviewState =
    !admin && policy.awaitingSupportResponse
      ? "pending"
      : "ready";

  renderComments(root, detail);
  sortAttachments(root, detail);
  syncTicketId(root);
  syncTechnicianEye(root);
  repairTechnicianAvatar(root);

  return true;
}

function clearPoll() {
  if (!pollTimer || !browser()) return false;

  window.clearTimeout(pollTimer);
  pollTimer = 0;
  return true;
}

function planPoll(id, detail = {}) {
  clearPoll();

  const policy = resolveConversationPolicy(detail);

  if (!browser() || !policy.awaitingSupportResponse) {
    return false;
  }

  pollTimer = window.setTimeout(() => {
    pollTimer = 0;

    const root = currentRoot();
    if (root && ticketId(root) === id) {
      hydrate(id, { force: true });
    }
  }, POLL_MS);

  return true;
}

function hydrate(id, { force = false } = {}) {
  const cleanId = text(id, "");
  if (!cleanId) return null;

  if (
    hydration?.ticketId === cleanId &&
    hydration?.promise &&
    !force
  ) {
    return hydration;
  }

  const sequence = ++requestSeq;

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
    promise: null,
  };

  current.promise = (async () => {
    try {
      const source = await api();
      const detail = await source.loadIncidenciaDetail(cleanId, {
        force,
        cache: !force,
      });

      if (sequence !== requestSeq) return null;

      current.detail = detail || null;
      current.resolved = true;
      current.stable = true;

      if (current.detail) {
        planPoll(cleanId, current.detail);
      }

      return current.detail;
    } catch (error) {
      if (sequence === requestSeq) {
        current.error = error;
        current.resolved = true;
        current.stable = true;
      }

      return null;
    } finally {
      schedule();
    }
  })();

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

function nodeTouches(node, selectors = []) {
  if (!(node instanceof Element)) return false;

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

function syncHostObserver() {
  const nextHost = document.querySelector(HOST);

  if (nextHost === host) {
    return Boolean(nextHost);
  }

  modalObserver?.disconnect?.();
  modalObserver = null;
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

function sync() {
  if (!browser()) return false;

  syncHostObserver();

  const root = currentRoot();
  const id = ticketId(root);

  if (!root || !id) {
    clearPoll();
    activeRoot = null;
    activeTicketId = "";
    lastSuccessKey = "";
    return false;
  }

  syncTicketId(root);
  syncTechnicianEye(root);
  repairTechnicianAvatar(root);

  if (activeRoot !== root || activeTicketId !== id) {
    activeRoot = root;
    activeTicketId = id;
    lastSuccessKey = "";

    /*
       El controller ya ha hidratado el detalle al abrir el modal, por lo que
       el cache suele resolver aquí sin red y evita flashes de estado.
    */
    hydrate(id, { force: false });
    return true;
  }

  if (refreshAfterSuccess(root)) {
    return true;
  }

  if (hydration?.ticketId === id && hydration?.detail) {
    return project(root, hydration.detail);
  }

  if (!hydration?.promise) {
    hydrate(id, { force: false });
  }

  return true;
}

function schedule() {
  if (!browser() || frame) return false;

  frame = window.requestAnimationFrame(() => {
    frame = 0;
    sync();
  });

  return true;
}

export function mountIncidenciasDetailState() {
  if (!browser()) return false;
  if (mounted) return true;

  mountRoot = document.querySelector(VIEW) || document.body;
  if (!mountRoot) return false;

  mounted = true;

  mountRoot.addEventListener("error", handleTechnicianAvatarError, true);

  if (typeof MutationObserver !== "undefined") {
    viewObserver = new MutationObserver((mutations) => {
      if (internalMutations > 0) return;

      for (const mutation of mutations) {
        for (const node of [
          ...mutation.addedNodes,
          ...mutation.removedNodes,
        ]) {
          if (nodeTouches(node, [HOST, ROOT])) {
            schedule();
            return;
          }
        }
      }
    });

    viewObserver.observe(mountRoot, {
      childList: true,
      subtree: true,
    });
  }

  schedule();
  return true;
}

export function destroyIncidenciasDetailState() {
  clearPoll();

  viewObserver?.disconnect?.();
  modalObserver?.disconnect?.();
  mountRoot?.removeEventListener?.("error", handleTechnicianAvatarError, true);

  if (frame && browser()) {
    window.cancelAnimationFrame?.(frame);
  }

  mounted = false;
  mountRoot = null;
  host = null;
  viewObserver = null;
  modalObserver = null;
  frame = 0;
  requestSeq += 1;
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
    policy: policy ? Object.freeze({ ...policy }) : null,
    ordering: Object.freeze({
      comments: "newest_first",
      attachments: "newest_first",
    }),
    pendingIndicator: "warning_clock_chip",
    technicianAvatarFallback: "initials_on_image_error",
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

/* =========================================================
   Onion Support · Incidencias User Update Turn
   Archivo: /src/features/incidencias-user-update-turn/index.js

   Proyección UI de la política de conversación del ticket.

   Autoridad:
   - backend: decide y bloquea realmente las escrituras
   - esta feature: explica el estado y desactiva sólo la pieza consumida

   Regla visible para usuario estándar:
   - un turno admite 1 comentario + 1 lote de adjuntos
   - una pieza ya enviada no puede repetirse
   - cuando el turno está completo, se espera respuesta real de soporte
   - comentario o adjunto de soporte abre un nuevo turno
   - cambios administrativos no desbloquean

   Esta feature es idempotente: si el estado no cambia, no vuelve a mutar DOM.
========================================================= */

export const INCIDENCIAS_USER_UPDATE_TURN_VERSION =
  "incidencias-user-update-turn.v2.idempotent-projection";

const VIEW = "#view-container, [data-router-view='true']";
const MODAL_HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const ADMIN_EDITOR = "[data-modal-admin-editor='true']";
const COMPOSER = "[data-modal-composer='true']";
const COMMENT = "[data-detail-field='comment']";
const ATTACHMENTS = "[data-detail-field='attachments']";
const DROPZONE = "[data-modal-dropzone='true']";
const SUBMIT = "[data-detail-action='detail-submit-update']";
const SUCCESS = ".incidencias-modal-feedback--success";
const STATUS = "[data-user-update-turn-status='true']";

const SUPPORT_EVENT_ROLES = new Set([
  "admin",
  "support",
  "technician",
  "tecnico",
  "agent",
  "staff",
]);

const USER_EVENT_ROLES = new Set([
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
let observer = null;
let modalObserver = null;
let observedModalHost = null;
let frame = 0;
let apiPromise = null;
let requestSeq = 0;
let hydration = null;
let visibleTicketId = "";
let lastSuccessKey = "";

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const text = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

const lower = (value = "") => text(value).toLowerCase();

const object = (value, fallback = {}) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;

const array = (value) => {
  if (Array.isArray(value)) return value;
  try { return value ? Array.from(value) : []; }
  catch { return []; }
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
  return observedModalHost?.querySelector?.(ROOT) || null;
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

  if (SUPPORT_EVENT_ROLES.has(role)) return "support";
  if (USER_EVENT_ROLES.has(role)) return "user";

  const identity = supportIdentity(detail);

  const actorId = text(
    raw.byUserId ||
    raw.userId ||
    raw.actorUserId ||
    raw.by?.userId ||
    raw.createdBy?.userId ||
    raw.uploadedBy?.userId
  );

  if (actorId && identity.ids.has(actorId)) return "support";

  const actorEmail = lower(
    raw.byEmail ||
    raw.email ||
    raw.actorEmail ||
    raw.by?.email ||
    raw.createdBy?.email ||
    raw.uploadedBy?.email
  );

  if (actorEmail && identity.emails.has(actorEmail)) return "support";
  return "";
}

function changeKind(change = {}) {
  const raw = object(change);
  const field = lower(raw.field || raw.type || raw.kind);
  const action = lower(raw.action || "add");

  if (!["add", "create", "created", "upload", "uploaded"].includes(action)) {
    return "";
  }

  if (COMMENT_FIELDS.has(field)) return "comment";
  if (ATTACHMENT_FIELDS.has(field)) return "attachment";
  return "";
}

function historyKinds(entry = {}) {
  const raw = object(entry);
  const kinds = new Set(array(raw.changes).map(changeKind).filter(Boolean));
  const type = lower(raw.kind || raw.type || raw.action || raw.event);

  if (["comment", "comentario", "comment_added"].includes(type)) {
    kinds.add("comment");
  }

  if (["attachments_added", "attachment_added", "attachment_uploaded"].includes(type)) {
    kinds.add("attachment");
  }

  return kinds;
}

function explicitPolicy(detail = {}) {
  const raw = object(first(detail?.raw, detail));
  const value = object(
    first(
      detail?.userUpdatePolicy,
      detail?.meta?.userUpdatePolicy,
      raw?.userUpdatePolicy,
      raw?.meta?.userUpdatePolicy,
      {}
    )
  );

  const hasCommentContract =
    typeof value.canUserAddComment === "boolean" ||
    typeof value.canUserComment === "boolean";

  const hasAttachmentContract =
    typeof value.canUserAddAttachment === "boolean" ||
    typeof value.canUserAttach === "boolean";

  if (
    typeof value.awaitingSupportResponse !== "boolean" ||
    !hasCommentContract ||
    !hasAttachmentContract
  ) {
    return null;
  }

  return {
    awaitingSupportResponse: value.awaitingSupportResponse === true,
    canUserAddComment:
      value.canUserAddComment !== undefined
        ? value.canUserAddComment === true
        : value.canUserComment === true,
    canUserAddAttachment:
      value.canUserAddAttachment !== undefined
        ? value.canUserAddAttachment === true
        : value.canUserAttach === true,
  };
}

function derivePolicy(detail = {}) {
  const canonical = explicitPolicy(detail);
  if (canonical) return canonical;

  const raw = object(first(detail?.raw, detail));
  const comments = array(first(detail?.comments, raw.comments, []));
  const history = array(first(detail?.history, raw.history, []));

  let lastSupport = 0;
  const userEvents = [];

  for (const comment of comments) {
    const at = eventTime(comment);
    const side = eventSide(comment, raw);

    if (!at) continue;
    if (side === "support") lastSupport = Math.max(lastSupport, at);
    if (side === "user") userEvents.push({ at, kind: "comment" });
  }

  for (const entry of history) {
    const kinds = historyKinds(entry);
    if (!kinds.size) continue;

    const at = eventTime(entry);
    const side = eventSide(entry, raw);

    if (!at) continue;

    if (side === "support") {
      lastSupport = Math.max(lastSupport, at);
      continue;
    }

    if (side === "user") {
      for (const kind of kinds) {
        userEvents.push({ at, kind });
      }
    }
  }

  const pending = userEvents.filter((event) => event.at > lastSupport);
  const commentUsed = pending.some((event) => event.kind === "comment");
  const attachmentUsed = pending.some((event) => event.kind === "attachment");

  return {
    awaitingSupportResponse: commentUsed || attachmentUsed,
    canUserAddComment: !commentUsed,
    canUserAddAttachment: !attachmentUsed,
  };
}

function setAttributeIfChanged(element, name, value) {
  if (!element) return false;

  const next = String(value);
  if (element.getAttribute(name) === next) return false;

  element.setAttribute(name, next);
  return true;
}

function setDisabledIfChanged(element, disabled) {
  if (!element) return false;

  const next = Boolean(disabled);
  let changed = false;

  if (element.disabled !== next) {
    element.disabled = next;
    changed = true;
  }

  changed =
    setAttributeIfChanged(
      element,
      "aria-disabled",
      next ? "true" : "false"
    ) || changed;

  return changed;
}

function setTextIfChanged(element, value = "") {
  if (!element) return false;

  const next = String(value ?? "");
  if (element.textContent === next) return false;

  element.textContent = next;
  return true;
}

function ensureStatus(composer) {
  let status = composer?.querySelector?.(STATUS) || null;

  if (!status && composer) {
    status = document.createElement("div");
    status.className = "incidencias-modal-feedback incidencias-modal-feedback--info";
    status.dataset.userUpdateTurnStatus = "true";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    composer.prepend(status);
  }

  return status;
}

function setStatus(composer, title = "", message = "") {
  const status = ensureStatus(composer);
  if (!status) return false;

  const safeTitle = text(title, "Información");
  const safeMessage = text(message, "");
  const signature = `${safeTitle}\n${safeMessage}`;

  if (status.dataset.userUpdateTurnSignature === signature) {
    return false;
  }

  const strong = document.createElement("strong");
  strong.textContent = safeTitle;

  const span = document.createElement("span");
  span.textContent = safeMessage;

  status.replaceChildren(strong, span);
  status.dataset.userUpdateTurnSignature = signature;
  return true;
}

function removeStatus(composer) {
  const status = composer?.querySelector?.(STATUS) || null;
  if (!status) return false;

  status.remove();
  return true;
}

function rememberDefaults(root) {
  const comment = root?.querySelector?.(COMMENT);
  const submit = root?.querySelector?.(SUBMIT);

  if (comment && !comment.dataset.userTurnOriginalPlaceholder) {
    comment.dataset.userTurnOriginalPlaceholder =
      comment.getAttribute("placeholder") || "";
  }

  if (submit && !submit.dataset.userTurnOriginalLabel) {
    submit.dataset.userTurnOriginalLabel =
      text(submit.textContent, "Enviar actualización");
  }
}

function setLoading(root) {
  if (!root || root.querySelector(ADMIN_EDITOR)) return false;

  const composer = root.querySelector(COMPOSER);
  if (!composer) return false;

  rememberDefaults(root);

  const comment = root.querySelector(COMMENT);
  const attachments = root.querySelector(ATTACHMENTS);
  const dropzone = root.querySelector(DROPZONE);
  const submit = root.querySelector(SUBMIT);

  if (root.dataset.userUpdateTurnApplied === "checking") {
    return true;
  }

  root.dataset.userUpdateTurn = "checking";
  root.dataset.userUpdateTurnApplied = "checking";

  setDisabledIfChanged(comment, true);
  setDisabledIfChanged(attachments, true);
  setDisabledIfChanged(submit, true);
  setAttributeIfChanged(dropzone, "aria-disabled", "true");
  setTextIfChanged(submit, "Comprobando disponibilidad…");

  setStatus(
    composer,
    "Comprobando actualización",
    "Estamos verificando el último turno de esta incidencia antes de habilitar una nueva actualización."
  );

  return true;
}

function applyPolicy(root, policy = {}) {
  if (!root || root.querySelector(ADMIN_EDITOR)) return false;

  const composer = root.querySelector(COMPOSER);
  if (!composer) return false;

  rememberDefaults(root);

  const comment = root.querySelector(COMMENT);
  const attachments = root.querySelector(ATTACHMENTS);
  const dropzone = root.querySelector(DROPZONE);
  const submit = root.querySelector(SUBMIT);

  const submitting = root.dataset.submitting === "true";
  const awaiting = policy.awaitingSupportResponse === true;
  const canComment = policy.canUserAddComment !== false;
  const canAttach = policy.canUserAddAttachment !== false;
  const fullyLocked = awaiting && !canComment && !canAttach;

  const state = fullyLocked
    ? "waiting-support"
    : awaiting
      ? "completing-turn"
      : "available";

  const signature = [
    state,
    canComment ? "comment:yes" : "comment:no",
    canAttach ? "attach:yes" : "attach:no",
    submitting ? "submitting:yes" : "submitting:no",
  ].join("|");

  if (root.dataset.userUpdateTurnApplied === signature) {
    return true;
  }

  root.dataset.userUpdateTurn = state;
  root.dataset.userUpdateTurnApplied = signature;
  composer.dataset.userUpdateTurn = state;

  setDisabledIfChanged(comment, submitting || !canComment);
  setDisabledIfChanged(attachments, submitting || !canAttach);
  setDisabledIfChanged(submit, submitting || fullyLocked);
  setAttributeIfChanged(
    dropzone,
    "aria-disabled",
    submitting || !canAttach ? "true" : "false"
  );

  if (comment) {
    const placeholder = !canComment
      ? "El comentario de esta actualización ya se ha enviado."
      : comment.dataset.userTurnOriginalPlaceholder || "";

    setAttributeIfChanged(comment, "placeholder", placeholder);
  }

  if (!submitting && submit) {
    const label = fullyLocked
      ? "Esperando respuesta del soporte"
      : awaiting && canComment && !canAttach
        ? "Añadir comentario a esta actualización"
        : awaiting && !canComment && canAttach
          ? "Añadir adjuntos a esta actualización"
          : submit.dataset.userTurnOriginalLabel || "Enviar actualización";

    setTextIfChanged(submit, label);
  }

  if (!awaiting) {
    removeStatus(composer);
    return true;
  }

  if (fullyLocked) {
    setStatus(
      composer,
      "Actualización enviada",
      "Tu actualización ya está en manos del equipo. Para mantener el seguimiento claro, podrás enviar una nueva cuando un técnico responda en esta incidencia. Si necesitamos continuar por correo, teléfono u otro canal, te lo indicaremos."
    );

    return true;
  }

  if (!canComment && canAttach) {
    setStatus(
      composer,
      "Mensaje enviado",
      "Tu comentario ya forma parte de esta actualización. Si necesitas completarla, todavía puedes añadir un único lote de archivos. Después esperaremos la respuesta del equipo."
    );

    return true;
  }

  if (canComment && !canAttach) {
    setStatus(
      composer,
      "Adjuntos enviados",
      "Los archivos ya forman parte de esta actualización. Puedes añadir un único comentario para completarla. Después esperaremos la respuesta del equipo."
    );
  }

  return true;
}

function hydrate(id = "", { force = false } = {}) {
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
    detail:
      !force && hydration?.ticketId === cleanId
        ? hydration.detail
        : null,
    resolved: false,
    promise: null,
  };

  current.promise = (async () => {
    try {
      const source = await api();
      const detail = await source.loadIncidenciaDetail(cleanId, {
        force: true,
        cache: false,
      });

      if (sequence !== requestSeq) return null;

      current.detail = detail || null;
      current.resolved = true;
      return current.detail;
    } catch {
      if (sequence === requestSeq) {
        current.resolved = true;
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
  const id = ticketId(root);
  const success = root?.querySelector?.(SUCCESS);

  if (!id || !success) return false;

  const key = `${id}::${text(success.textContent)}`;
  if (!key || key === lastSuccessKey) return false;

  lastSuccessKey = key;
  hydrate(id, { force: true });
  return true;
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
      attributes: true,
      attributeFilter: ["data-submitting"],
    });
  }

  return Boolean(observedModalHost);
}

function sync() {
  if (!browser()) return false;

  syncModalObserver();

  const root = currentRoot();
  const id = ticketId(root);

  if (!root || !id) {
    visibleTicketId = "";
    lastSuccessKey = "";
    return false;
  }

  if (root.querySelector(ADMIN_EDITOR)) {
    visibleTicketId = id;
    return true;
  }

  if (visibleTicketId !== id) {
    visibleTicketId = id;
    lastSuccessKey = "";
    setLoading(root);
    hydrate(id, { force: true });
    return true;
  }

  if (refreshAfterSuccess(root)) {
    return true;
  }

  if (hydration?.ticketId === id && hydration?.detail) {
    applyPolicy(root, derivePolicy(hydration.detail));
    return true;
  }

  if (!hydration?.promise) {
    setLoading(root);
    hydrate(id, { force: true });
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

export function mountIncidenciasUserUpdateTurn() {
  if (!browser()) return false;
  if (mounted) return true;

  mountRoot = document.querySelector(VIEW) || document.body;
  if (!mountRoot) return false;

  mounted = true;

  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(schedule);
    observer.observe(mountRoot, {
      childList: true,
      subtree: true,
    });
  }

  schedule();
  return true;
}

export function destroyIncidenciasUserUpdateTurn() {
  observer?.disconnect?.();
  modalObserver?.disconnect?.();

  if (frame && browser()) {
    window.cancelAnimationFrame?.(frame);
  }

  mounted = false;
  mountRoot = null;
  observer = null;
  modalObserver = null;
  observedModalHost = null;
  frame = 0;
  hydration = null;
  visibleTicketId = "";
  lastSuccessKey = "";
  requestSeq += 1;

  return true;
}

export function getIncidenciasUserUpdateTurnSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_USER_UPDATE_TURN_VERSION,
    mounted,
    ticketId: hydration?.ticketId || "",
    hydrated: Boolean(hydration?.detail),
    policy: hydration?.detail
      ? Object.freeze(derivePolicy(hydration.detail))
      : null,
    backendIsAuthority: true,
    domProjectionIsIdempotent: true,
    userTurn: Object.freeze({
      maxComments: 1,
      maxAttachmentBatches: 1,
      unlocksOn: "support_comment_or_attachment",
    }),
  });
}

if (browser()) mountIncidenciasUserUpdateTurn();

export default Object.freeze({
  version: INCIDENCIAS_USER_UPDATE_TURN_VERSION,
  mount: mountIncidenciasUserUpdateTurn,
  destroy: destroyIncidenciasUserUpdateTurn,
  getSnapshot: getIncidenciasUserUpdateTurnSnapshot,
});

/* =========================================================
   Onion Support · Incidencias Detail Experience
   Archivo: /src/features/incidencias-detail-experience/index.js

   Mejora progresiva del modal Details:
   - conserva visible el ID completo sin cambiar el contrato de copiado;
   - convierte el affordance del técnico en ojo-only y mantiene el card clicable;
   - proyecta los comentarios canónicos dentro de la zona de Descripción;
   - serializa la acción destructiva "Cerrar ticket" detrás de la hidratación
     inicial del detalle para eliminar la carrera apertura -> cierre inmediato;
   - no muta tickets, comentarios, permisos ni contratos HTTP.

   Arquitectura:
   - el Router sigue siendo la autoridad del ciclo de vista;
   - la isla [data-incidencias-modal-host] es la autoridad del modal;
   - la API de Incidencias sigue siendo la única fuente de detalle;
   - sólo se añade presentación derivada y coordinación de interacción.
========================================================= */

import { persistedCommentId } from "../incidencias-comment-identity/index.js";

export const INCIDENCIAS_DETAIL_EXPERIENCE_VERSION =
  "incidencias-detail-experience.v1.stable-detail-lifecycle";

const VIEW = "#view-container, [data-router-view='true']";
const MODAL_HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const DESCRIPTION_SECTION = ".incidencias-modal-description-section";
const DESCRIPTION_TEXT = ".incidencias-modal-description";
const ID_CHIP = ".incidencias-modal-id-chip[data-ticket-id]";
const ID_TEXT = ".incidencias-modal-id-chip-text";
const TECH_CARD = ".incidencias-modal-technician-card[data-technician-profile-trigger='true']";
const TECH_INLINE = ".incidencias-modal-technician-inline[data-technician-assigned='true']";
const TECH_EYE = "[data-technician-profile-eye='true']";
const CLOSE_TICKET = "[data-detail-action='detail-ticket-close']";
const CLOSE_CONFIRM = "[data-detail-action='detail-ticket-close-confirm']";
const SUBMIT = "[data-detail-action='detail-submit-update']";

const COMMENT_KEYS = Object.freeze([
  "comments",
  "notes",
  "messages",
]);

let mounted = false;
let mountRoot = null;
let observer = null;
let modalObserver = null;
let observedModalHost = null;
let frame = 0;
let apiPromise = null;
let requestSeq = 0;
let currentHydration = null;
let lastRoot = null;
let lastSuccessKey = "";

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

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
    if (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) continue;
    return value;
  }
  return null;
}

function normalizeKey(value = "") {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function timestamp(value = null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 100000000000 ? value * 1000 : value;
  }

  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateLabel(value = null) {
  const time = timestamp(value);
  if (!time) return "Fecha no disponible";

  try {
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(time));
  } catch {
    return "Fecha no disponible";
  }
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

function afterPaint() {
  return new Promise((resolve) => {
    if (!browser() || typeof window.requestAnimationFrame !== "function") {
      window.setTimeout?.(resolve, 0);
      return;
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

const api = () =>
  apiPromise ||= import("../../views/incidencias/incidencias.api.js");

function normalizeComment(item = {}, index = 0) {
  const raw = object(item);
  const kind = normalizeKey(first(raw.kind, raw.type, raw.action, raw.event, "comment"));

  if (kind && !["comment", "comentario"].includes(kind)) {
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
    id: text(first(raw.id, raw.commentId, raw.eventId, `comment_${index}`), `comment_${index}`),
    persistedCommentId: persistedCommentId(raw),
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
    createdAt: first(raw.createdAt, raw.date, raw.timestamp, raw.updatedAt, null),
  };
}

function commentsFromDetail(detail = {}) {
  const raw = object(first(detail?.raw, detail?.data, detail?.item, {}));
  const directTimeline = array(first(detail?.timeline, raw.timeline, []));

  let source = [];

  if (directTimeline.length) {
    source = directTimeline.filter((entry) => {
      const value = normalizeKey(first(entry?.kind, entry?.type, entry?.action, entry?.event, ""));
      return ["comment", "comentario"].includes(value);
    });
  } else {
    for (const key of COMMENT_KEYS) {
      const direct = array(detail?.[key]);
      if (direct.length) {
        source = direct;
        break;
      }

      const nested = array(raw?.[key]);
      if (nested.length) {
        source = nested;
        break;
      }
    }
  }

  return source
    .map(normalizeComment)
    .filter(Boolean)
    .sort((a, b) => timestamp(a.createdAt) - timestamp(b.createdAt));
}

function commentSignature(comments = []) {
  return array(comments)
    .map((item) => [item.id, item.persistedCommentId, item.author, item.body, timestamp(item.createdAt)].join("::"))
    .join("||");
}

function buildCommentCard(comment = {}) {
  const article = document.createElement("article");
  article.className = "incidencias-modal-description-comment";
  article.dataset.descriptionComment = "true";
  if (comment.persistedCommentId) article.dataset.commentId = comment.persistedCommentId;

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
  date.textContent = dateLabel(comment.createdAt);

  head.append(author, date);

  const body = document.createElement("p");
  body.textContent = multiline(comment.body, "Actualización registrada.");

  content.append(head, body);
  article.append(accent, content);
  return article;
}

function renderDescriptionComments(root = currentRoot(), detail = {}) {
  if (!root?.isConnected) return false;

  const section = root.querySelector(DESCRIPTION_SECTION);
  const description = section?.querySelector(DESCRIPTION_TEXT);
  if (!section || !description) return false;

  const comments = commentsFromDetail(detail);
  const signature = commentSignature(comments);
  let thread = section.querySelector("[data-description-comments='true']");

  if (!comments.length) {
    thread?.remove?.();
    section.dataset.hasDescriptionComments = "false";
    return true;
  }

  if (thread?.dataset?.commentSignature === signature) {
    section.dataset.hasDescriptionComments = "true";
    return true;
  }

  if (!thread) {
    thread = document.createElement("section");
    thread.className = "incidencias-modal-description-thread";
    thread.dataset.descriptionComments = "true";
    thread.setAttribute("aria-label", "Comentarios y seguimiento de la incidencia");
    description.insertAdjacentElement("afterend", thread);
  }

  thread.dataset.commentSignature = signature;
  thread.replaceChildren();

  const head = document.createElement("div");
  head.className = "incidencias-modal-description-thread-head";

  const title = document.createElement("strong");
  title.textContent = "Seguimiento";

  const count = document.createElement("span");
  count.textContent = `${comments.length} comentario${comments.length === 1 ? "" : "s"}`;

  head.append(title, count);

  const list = document.createElement("div");
  list.className = "incidencias-modal-description-comments";
  for (const comment of comments) list.appendChild(buildCommentCard(comment));

  thread.append(head, list);
  section.dataset.hasDescriptionComments = "true";
  return true;
}

function syncTicketId(root = currentRoot()) {
  const chip = root?.querySelector?.(ID_CHIP);
  const label = chip?.querySelector?.(ID_TEXT);
  const id = text(chip?.dataset?.ticketId, "");
  if (!chip || !label || !id) return false;

  if (label.textContent !== id) label.textContent = id;
  chip.dataset.fullTicketIdVisible = "true";
  chip.title = `Copiar ID: ${id}`;
  return true;
}

function syncTechnicianEye(root = currentRoot()) {
  const card = root?.querySelector?.(TECH_CARD);
  const inline = card?.querySelector?.(TECH_INLINE);
  const name = text(inline?.querySelector?.("strong")?.textContent, "Técnico");
  if (!card || !inline) return false;

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

function startHydration(root = currentRoot(), { force = false } = {}) {
  const id = ticketId(root);
  if (!id || !root?.isConnected) return null;

  if (
    currentHydration?.ticketId === id &&
    currentHydration?.root === root &&
    currentHydration?.promise &&
    !force
  ) {
    return currentHydration;
  }

  const sequence = ++requestSeq;
  const hydration = {
    ticketId: id,
    root,
    sequence,
    resolved: false,
    stable: false,
    detail: null,
    promise: null,
  };

  hydration.promise = (async () => {
    try {
      const source = await api();
      const detail = await source.loadIncidenciaDetail(id, {
        force,
        cache: !force,
      });

      if (
        sequence !== requestSeq ||
        currentRoot() !== root ||
        ticketId(root) !== id
      ) {
        return null;
      }

      hydration.detail = detail || null;
      hydration.resolved = true;
      if (detail) renderDescriptionComments(root, detail);

      await afterPaint();

      if (
        sequence === requestSeq &&
        currentRoot() === root &&
        ticketId(root) === id
      ) {
        hydration.stable = true;
      }

      return detail || null;
    } catch {
      hydration.resolved = true;
      await afterPaint();
      hydration.stable = true;
      return null;
    } finally {
      schedule();
    }
  })();

  currentHydration = hydration;
  return hydration;
}

function refreshDescriptionAfterSuccess(root = currentRoot()) {
  const id = ticketId(root);
  const feedback = root?.querySelector?.(".incidencias-modal-feedback--success");
  if (!id || !feedback) return false;

  const key = `${id}::${text(feedback.textContent)}`;
  if (!key || key === lastSuccessKey) return false;

  lastSuccessKey = key;
  startHydration(root, { force: true });
  return true;
}

async function gateCloseTicket(button = null) {
  const root = button?.closest?.(ROOT);
  const id = ticketId(root);
  if (!root || !id || button?.dataset?.detailLifecycleReplay === "true") {
    if (button?.dataset) delete button.dataset.detailLifecycleReplay;
    return false;
  }

  let hydration = currentHydration;
  if (!hydration || hydration.root !== root || hydration.ticketId !== id) {
    hydration = startHydration(root);
  }

  if (hydration?.stable) return false;

  try {
    await hydration?.promise;
  } catch {
    // Un error de refresco no debe bloquear la acción de cierre.
  }

  await afterPaint();

  const liveRoot = currentRoot();
  if (
    liveRoot !== root ||
    ticketId(liveRoot) !== id ||
    liveRoot?.dataset?.submitting === "true" ||
    liveRoot?.querySelector?.(CLOSE_CONFIRM)
  ) {
    return true;
  }

  const liveButton = liveRoot?.querySelector?.(CLOSE_TICKET);
  if (!liveButton || liveButton.disabled) return true;

  liveButton.dataset.detailLifecycleReplay = "true";
  liveButton.click();
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
    modalObserver.observe(observedModalHost, { childList: true, subtree: true });
  }

  return Boolean(observedModalHost);
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return;

  syncModalObserver();
  const root = currentRoot();

  if (!root) {
    if (lastRoot) {
      requestSeq += 1;
      currentHydration = null;
      lastSuccessKey = "";
    }
    lastRoot = null;
    return;
  }

  if (lastRoot !== root) {
    requestSeq += 1;
    currentHydration = null;
    lastSuccessKey = "";
    lastRoot = root;
  }

  syncTicketId(root);
  syncTechnicianEye(root);

  const hydration = startHydration(root);
  if (hydration?.detail) renderDescriptionComments(root, hydration.detail);
  refreshDescriptionAfterSuccess(root);
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

function onClick(event) {
  const target = event.target?.nodeType === 3
    ? event.target.parentElement
    : event.target;

  const button = target?.closest?.(CLOSE_TICKET);
  if (!button || !button.closest?.(ROOT)) return;

  if (button.dataset.detailLifecycleReplay === "true") {
    delete button.dataset.detailLifecycleReplay;
    return;
  }

  const hydration = currentHydration;
  if (hydration?.stable) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  void gateCloseTicket(button);
}

export function mountIncidenciasDetailExperience() {
  if (!browser() || mounted) return false;

  const root = document.querySelector(VIEW);
  if (!root || typeof MutationObserver === "undefined") return false;

  mounted = true;
  mountRoot = root;
  document.addEventListener("click", onClick, true);

  observer = new MutationObserver(schedule);
  observer.observe(mountRoot, { childList: true, subtree: true });
  schedule();
  return true;
}

export function destroyIncidenciasDetailExperience() {
  if (!browser() || !mounted) return false;

  mounted = false;
  requestSeq += 1;
  document.removeEventListener("click", onClick, true);

  observer?.disconnect?.();
  modalObserver?.disconnect?.();
  observer = null;
  modalObserver = null;
  observedModalHost = null;

  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;

  currentHydration = null;
  lastRoot = null;
  lastSuccessKey = "";
  mountRoot = null;
  return true;
}

export function getIncidenciasDetailExperienceSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_DETAIL_EXPERIENCE_VERSION,
    mounted,
    observerScope: "router-view+incidencias-modal-host",
    ticketId: currentHydration?.ticketId || "",
    hydrationResolved: Boolean(currentHydration?.resolved),
    hydrationStable: Boolean(currentHydration?.stable),
    modalMounted: Boolean(lastRoot?.isConnected),
  });
}

if (browser()) mountIncidenciasDetailExperience();

export default Object.freeze({
  version: INCIDENCIAS_DETAIL_EXPERIENCE_VERSION,
  mount: mountIncidenciasDetailExperience,
  destroy: destroyIncidenciasDetailExperience,
  getSnapshot: getIncidenciasDetailExperienceSnapshot,
});

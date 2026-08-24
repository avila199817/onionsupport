/* =========================================================
   Onion Support · Incidencias Detail Live Sync
   Archivo: /src/features/incidencias-detail-live-sync/index.js

   Autoridad progresiva de frescura del Modal Details:
   - stale-while-revalidate real: el modal pinta inmediatamente y se revalida
     contra servidor con force=true/cache=false;
   - refresco adaptativo mientras el modal permanece visible;
   - refresh inmediato al volver a la pestaña, recuperar foco/online y después
     de una mutación confirmada;
   - aplica en un único turno de pintura sólo slots remotos/no editables;
   - preserva textarea, archivos pendientes, foco, preview y confirmaciones;
   - muestra un mini indicador no bloqueante en vez de vaciar el modal;
   - nunca necesita recargar la página para ver el último comentario.

   El backend y el controller siguen siendo la autoridad de escrituras.
========================================================= */

export const INCIDENCIAS_DETAIL_LIVE_SYNC_VERSION =
  "incidencias-detail-live-sync.v1.atomic-swr";

const VIEW = "#view-container, [data-router-view='true']";
const HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const PANEL = "[data-incidencias-modal-panel='true']";
const BODY = "[data-modal-body='true']";
const ADMIN = "[data-modal-admin-editor='true']";
const DESCRIPTION_SECTION = ".incidencias-modal-description-section";
const DESCRIPTION_TEXT = ".incidencias-modal-description";
const COMMENT_THREAD = "[data-description-comments='true']";
const SUCCESS = ".incidencias-modal-feedback--success";
const LIVE = "[data-detail-live-sync='true']";

const FAST_POLL_MS = 6_000;
const IDLE_POLL_MS = 12_000;
const ERROR_POLL_MS = 15_000;
const HOT_WINDOW_MS = 30_000;
const INDICATOR_DELAY_MS = 140;
const INDICATOR_SETTLE_MS = 1_000;

let mounted = false;
let mountRoot = null;
let host = null;
let viewObserver = null;
let modalObserver = null;
let frame = 0;
let pollTimer = 0;
let indicatorDelayTimer = 0;
let indicatorSettleTimer = 0;
let requestSeq = 0;
let requestController = null;
let inflight = null;
let apiPromise = null;
let templatePromise = null;
let internalMutations = 0;

let activeRoot = null;
let activeTicketId = "";
let lastDetail = null;
let lastSignature = "";
let lastSuccessKey = "";
let lastChangedAt = 0;
let lastSyncedAt = 0;
let lastError = null;
let syncCount = 0;
let changeCount = 0;

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

const array = (value) => Array.isArray(value) ? value : [];

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

function currentRoot() {
  return host?.querySelector?.(ROOT) || null;
}

function ticketId(root = currentRoot()) {
  return text(root?.dataset?.ticketId || root?.dataset?.incidenciaId, "");
}

function pageVisible() {
  return !browser() || document.visibilityState !== "hidden";
}

function rootBusy(root = currentRoot()) {
  return Boolean(
    root?.dataset?.submitting === "true" ||
    root?.dataset?.closeConfirmOpen === "true" ||
    root?.dataset?.discardConfirmOpen === "true"
  );
}

const api = () =>
  apiPromise ||= import("../../views/incidencias/incidencias.api.js");

const template = () =>
  templatePromise ||= import("../../views/incidencias/incidencias.template.modal.js");

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

function ensureIndicator(root = currentRoot()) {
  if (!root?.isConnected) return null;

  const panel = root.querySelector(PANEL);
  if (!panel) return null;

  let live = panel.querySelector(LIVE);
  if (live) return live;

  live = document.createElement("div");
  live.className = "incidencias-modal-live-sync";
  live.dataset.detailLiveSync = "true";
  live.dataset.state = "idle";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  live.setAttribute("aria-atomic", "true");
  live.hidden = true;

  const spinner = document.createElement("span");
  spinner.className = "incidencias-modal-live-sync-spinner";
  spinner.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "incidencias-modal-live-sync-label";
  label.dataset.liveSyncLabel = "true";
  label.textContent = "Sincronizando…";

  live.append(spinner, label);
  ownMutation(() => panel.appendChild(live));
  return live;
}

function clearIndicatorTimers() {
  if (!browser()) return;

  if (indicatorDelayTimer) window.clearTimeout(indicatorDelayTimer);
  if (indicatorSettleTimer) window.clearTimeout(indicatorSettleTimer);
  indicatorDelayTimer = 0;
  indicatorSettleTimer = 0;
}

function showIndicator(root, state, label) {
  if (!root?.isConnected) return false;

  const live = ensureIndicator(root);
  const textNode = live?.querySelector?.("[data-live-sync-label='true']");
  if (!live || !textNode) return false;

  live.dataset.state = state;
  live.hidden = false;
  textNode.textContent = label;
  return true;
}

function hideIndicator(root = currentRoot()) {
  const live = root?.querySelector?.(LIVE);
  if (!live) return false;
  live.dataset.state = "idle";
  live.hidden = true;
  return true;
}

function beginIndicator(root) {
  clearIndicatorTimers();
  root.dataset.liveSyncState = "syncing";

  const panel = root.querySelector(PANEL);
  panel?.setAttribute?.("aria-busy", "true");

  indicatorDelayTimer = window.setTimeout(() => {
    indicatorDelayTimer = 0;
    if (
      root.isConnected &&
      root === currentRoot() &&
      root.dataset.liveSyncState === "syncing"
    ) {
      showIndicator(root, "syncing", "Sincronizando…");
    }
  }, INDICATOR_DELAY_MS);
}

function finishIndicator(root, { changed = false, error = false } = {}) {
  if (!root?.isConnected) return;

  if (indicatorDelayTimer) {
    window.clearTimeout(indicatorDelayTimer);
    indicatorDelayTimer = 0;
  }

  const panel = root.querySelector(PANEL);
  panel?.setAttribute?.("aria-busy", "false");

  if (error) {
    root.dataset.liveSyncState = "retry";
    showIndicator(root, "error", "Sin conexión · reintentando");
  } else {
    root.dataset.liveSyncState = "ready";
    showIndicator(root, "ready", changed ? "Contenido actualizado" : "Al día");
  }

  indicatorSettleTimer = window.setTimeout(() => {
    indicatorSettleTimer = 0;
    if (!root.isConnected || root !== currentRoot()) return;
    hideIndicator(root);
    if (!error) root.dataset.liveSyncState = "idle";
  }, error ? 2_000 : INDICATOR_SETTLE_MS);
}

function normalizeComment(item = {}, index = 0) {
  const raw = object(item);
  const kind = text(first(raw.kind, raw.type, raw.action, raw.event, "comment"), "")
    .toLowerCase();

  if (kind && !["comment", "comentario"].includes(kind)) return null;

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
    sourceIndex: index,
  };
}

function commentsFromDetail(detail = {}) {
  const raw = object(first(detail?.raw, detail?.data, detail?.item, detail));
  const timeline = array(first(detail?.timeline, raw.timeline, []));

  let source;

  if (timeline.length) {
    source = timeline.filter((entry) =>
      ["comment", "comentario"].includes(
        text(first(entry?.kind, entry?.type, entry?.action, entry?.event, ""), "")
          .toLowerCase()
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

function commentsSignature(comments = []) {
  return comments
    .map((item) => [item.id, item.body, timestamp(item.createdAt)].join("::"))
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

function renderFreshComments(root, detail = {}) {
  const section = root?.querySelector?.(DESCRIPTION_SECTION);
  const description = section?.querySelector?.(DESCRIPTION_TEXT);
  if (!section || !description) return false;

  const comments = commentsFromDetail(detail);
  const signature = commentsSignature(comments);
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

  const nextThread = document.createElement("section");
  nextThread.className = "incidencias-modal-description-thread";
  nextThread.dataset.descriptionComments = "true";
  nextThread.dataset.commentSignature = signature;
  nextThread.setAttribute("aria-label", "Comentarios y seguimiento de la incidencia");

  const head = document.createElement("div");
  head.className = "incidencias-modal-description-thread-head";

  const title = document.createElement("strong");
  title.textContent = "Seguimiento";

  const count = document.createElement("span");
  count.textContent = `${comments.length} comentario${comments.length === 1 ? "" : "s"}`;

  const list = document.createElement("div");
  list.className = "incidencias-modal-description-comments";
  for (const comment of comments) list.appendChild(buildCommentCard(comment));

  head.append(title, count);
  nextThread.append(head, list);

  ownMutation(() => {
    if (thread) thread.replaceWith(nextThread);
    else description.insertAdjacentElement("afterend", nextThread);
  });

  section.dataset.hasDescriptionComments = "true";
  return true;
}

function detailSignature(detail = {}) {
  const raw = object(first(detail?.raw, detail));
  const comments = commentsFromDetail(detail);
  const attachments = array(
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

  const attachmentSig = attachments.map((file, index) => [
    text(file?.id || file?.attachmentId || file?.fileId || `att_${index}`),
    text(file?.name || file?.filename || file?.fileName, ""),
    Number(file?.size || file?.sizeBytes || 0),
    timestamp(file?.uploadedAt || file?.createdAt || file?.updatedAt),
  ].join("::")).join("||");

  return [
    text(detail?.status || detail?.estado, ""),
    text(detail?.priority || detail?.prioridad, ""),
    text(detail?.category || detail?.categoria || detail?.type, ""),
    timestamp(detail?.lastActivityAt || detail?.updatedAt),
    commentsSignature(comments),
    attachmentSig,
  ].join("###");
}

function cloneRootFromHtml(html = "") {
  if (!html || !browser()) return null;

  const holder = document.createElement("template");
  holder.innerHTML = String(html).trim();
  return holder.content.querySelector(ROOT);
}

function activeInside(node = null) {
  if (!node || !browser()) return false;
  try {
    return Boolean(document.activeElement && node.contains(document.activeElement));
  } catch {
    return false;
  }
}

async function projectRemoteSlots(root, detail = {}) {
  if (!root?.isConnected || rootBusy(root)) return false;

  let renderer = null;

  try {
    renderer = (await template()).renderIncidenciasDetailModal;
  } catch {
    renderer = null;
  }

  if (typeof renderer !== "function") {
    renderFreshComments(root, detail);
    return false;
  }

  const admin = Boolean(root.querySelector(ADMIN));
  const historyOpen = root.querySelector(BODY)?.dataset?.historyMode === "history";

  const html = renderer({
    open: true,
    detail,
    admin,
    role: admin ? "admin" : "user",
    historyOpen,
    commentDraft: "",
    pendingFiles: [],
    submitting: false,
    operation: "",
    feedbackMessage: "",
    feedbackType: "info",
  });

  const nextRoot = cloneRootFromHtml(html);
  if (!nextRoot || ticketId(root) !== ticketId(nextRoot)) return false;

  /*
     Un único micro-turno de mutación: no se toca textarea/composer/preview ni
     confirmaciones. El navegador pinta el conjunto después de este callback.
  */
  ownMutation(() => {
    const pairs = [
      "[data-modal-updated='true']",
      ".incidencias-modal-meta-grid",
      ".incidencias-modal-contact-section",
    ];

    for (const selector of pairs) {
      const current = root.querySelector(selector);
      const next = nextRoot.querySelector(selector);
      if (current && next && !activeInside(current)) {
        current.replaceWith(next.cloneNode(true));
      }
    }

    const currentFiles = root.querySelector("[data-modal-files-slot='true']");
    const nextFiles = nextRoot.querySelector("[data-modal-files-slot='true']");
    if (
      currentFiles &&
      nextFiles &&
      !activeInside(currentFiles) &&
      !currentFiles.querySelector("[aria-busy='true']")
    ) {
      currentFiles.replaceWith(nextFiles.cloneNode(true));
    }

    const currentHistory = root.querySelector("[data-modal-history-slot='true']");
    const nextHistory = nextRoot.querySelector("[data-modal-history-slot='true']");
    if (currentHistory && nextHistory && !activeInside(currentHistory)) {
      currentHistory.replaceWith(nextHistory.cloneNode(true));
    }

    const currentAdmin = root.querySelector(ADMIN);
    const nextAdmin = nextRoot.querySelector(ADMIN);
    const adminDirty = currentAdmin?.dataset?.adminTicketDirty === "true";
    if (
      currentAdmin &&
      nextAdmin &&
      !adminDirty &&
      !activeInside(currentAdmin)
    ) {
      currentAdmin.replaceWith(nextAdmin.cloneNode(true));
    }
  });

  renderFreshComments(root, detail);
  return true;
}

function clearPoll() {
  if (pollTimer && browser()) window.clearTimeout(pollTimer);
  pollTimer = 0;
}

function pollDelay() {
  if (lastError) return ERROR_POLL_MS;
  if (lastChangedAt && Date.now() - lastChangedAt <= HOT_WINDOW_MS) {
    return FAST_POLL_MS;
  }
  return IDLE_POLL_MS;
}

function planPoll() {
  clearPoll();
  if (!browser() || !mounted || !pageVisible() || !activeTicketId) return false;

  pollTimer = window.setTimeout(() => {
    pollTimer = 0;
    const root = currentRoot();
    const id = ticketId(root);

    if (root && id && id === activeTicketId) {
      void refreshDetail(id, { reason: "poll" });
    }
  }, pollDelay());

  return true;
}

function abortRequest() {
  requestSeq += 1;
  try { requestController?.abort?.(); } catch { /* noop */ }
  requestController = null;
  inflight = null;
}

async function refreshDetail(id = "", { reason = "sync" } = {}) {
  const cleanId = text(id, "");
  const root = currentRoot();

  if (
    !cleanId ||
    !root?.isConnected ||
    ticketId(root) !== cleanId ||
    rootBusy(root) ||
    !pageVisible()
  ) {
    planPoll();
    return false;
  }

  if (inflight?.ticketId === cleanId && inflight?.promise) {
    return inflight.promise;
  }

  const sequence = ++requestSeq;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  requestController = controller;
  beginIndicator(root);

  const task = (async () => {
    try {
      const source = await api();
      const detail = await source.loadIncidenciaDetail(cleanId, {
        force: true,
        cache: false,
        signal: controller?.signal,
      });

      if (
        sequence !== requestSeq ||
        !detail ||
        !root.isConnected ||
        root !== currentRoot() ||
        ticketId(root) !== cleanId
      ) {
        return false;
      }

      const signature = detailSignature(detail);
      const changed = Boolean(lastSignature && signature !== lastSignature);

      await projectRemoteSlots(root, detail);

      if (
        sequence !== requestSeq ||
        !root.isConnected ||
        root !== currentRoot()
      ) {
        return false;
      }

      lastDetail = detail;
      lastSignature = signature;
      lastSyncedAt = Date.now();
      lastError = null;
      syncCount += 1;

      if (changed) {
        lastChangedAt = Date.now();
        changeCount += 1;
      }

      root.dataset.liveSyncLastSuccessAt = new Date(lastSyncedAt).toISOString();
      root.dataset.liveSyncReason = text(reason, "sync");
      finishIndicator(root, { changed, error: false });
      return true;
    } catch (error) {
      if (sequence !== requestSeq) return false;

      const aborted = error?.name === "AbortError";
      if (!aborted) {
        lastError = error || new Error("LIVE_SYNC_FAILED");
        finishIndicator(root, { error: true });
      }
      return false;
    } finally {
      if (sequence === requestSeq) {
        requestController = null;
        inflight = null;
        planPoll();
      }
    }
  })();

  inflight = { ticketId: cleanId, promise: task };
  return task;
}

function successKey(root = currentRoot()) {
  const success = root?.querySelector?.(SUCCESS);
  const id = ticketId(root);
  const value = text(success?.textContent, "");
  return id && value ? `${id}::${value}` : "";
}

function syncHostObserver() {
  if (!browser()) return false;

  const nextHost = document.querySelector(HOST);
  if (nextHost === host) return Boolean(nextHost);

  modalObserver?.disconnect?.();
  modalObserver = null;
  host = nextHost || null;

  if (host && typeof MutationObserver !== "undefined") {
    modalObserver = new MutationObserver(() => {
      if (!internalMutations) schedule();
    });
    modalObserver.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-submitting",
        "data-history-mode",
        "data-open",
      ],
    });
  }

  return Boolean(host);
}

function resetActive() {
  clearPoll();
  clearIndicatorTimers();
  abortRequest();
  activeRoot = null;
  activeTicketId = "";
  lastDetail = null;
  lastSignature = "";
  lastSuccessKey = "";
  lastChangedAt = 0;
  lastSyncedAt = 0;
  lastError = null;
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return false;

  syncHostObserver();

  const root = currentRoot();
  const id = ticketId(root);

  if (!root || !id) {
    if (activeTicketId) resetActive();
    return false;
  }

  if (activeRoot !== root || activeTicketId !== id) {
    clearPoll();
    abortRequest();
    activeRoot = root;
    activeTicketId = id;
    lastDetail = null;
    lastSignature = "";
    lastSuccessKey = successKey(root);
    lastChangedAt = 0;
    lastSyncedAt = 0;
    lastError = null;

    /* El contenido local ya está pintado: revalidamos sin vaciar el modal. */
    void refreshDetail(id, { reason: "open" });
    return true;
  }

  const currentSuccessKey = successKey(root);
  if (currentSuccessKey && currentSuccessKey !== lastSuccessKey) {
    lastSuccessKey = currentSuccessKey;
    void refreshDetail(id, { reason: "mutation-success" });
    return true;
  }

  planPoll();
  return true;
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

function onWake() {
  if (!mounted || !pageVisible()) return;
  const root = currentRoot();
  const id = ticketId(root);
  if (root && id) void refreshDetail(id, { reason: "wake" });
}

export function mountIncidenciasDetailLiveSync() {
  if (!browser() || mounted) return false;

  mountRoot = document.querySelector(VIEW) || document.body;
  if (!mountRoot || typeof MutationObserver === "undefined") return false;

  mounted = true;

  viewObserver = new MutationObserver((mutations) => {
    if (internalMutations) return;

    for (const mutation of mutations) {
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (
          node?.nodeType === 1 &&
          (node.matches?.(HOST) || node.matches?.(ROOT) || node.querySelector?.(HOST) || node.querySelector?.(ROOT))
        ) {
          schedule();
          return;
        }
      }
    }
  });

  viewObserver.observe(mountRoot, { childList: true, subtree: true });

  window.addEventListener("focus", onWake);
  window.addEventListener("online", onWake);
  document.addEventListener("visibilitychange", onWake);

  schedule();
  return true;
}

export function destroyIncidenciasDetailLiveSync() {
  if (!browser()) return false;

  mounted = false;
  resetActive();

  viewObserver?.disconnect?.();
  modalObserver?.disconnect?.();
  viewObserver = null;
  modalObserver = null;

  window.removeEventListener("focus", onWake);
  window.removeEventListener("online", onWake);
  document.removeEventListener("visibilitychange", onWake);

  if (frame) window.cancelAnimationFrame?.(frame);
  frame = 0;
  host = null;
  mountRoot = null;
  return true;
}

export function getIncidenciasDetailLiveSyncSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_DETAIL_LIVE_SYNC_VERSION,
    mounted,
    ticketId: activeTicketId ? "***" : "",
    syncing: Boolean(inflight?.promise),
    lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
    syncCount,
    changeCount,
    hasError: Boolean(lastError),
    poll: Object.freeze({
      fastMs: FAST_POLL_MS,
      idleMs: IDLE_POLL_MS,
      errorMs: ERROR_POLL_MS,
      pausesWhenHidden: true,
    }),
    policy: Object.freeze({
      staleWhileRevalidate: true,
      forceServerRevalidation: true,
      cacheBypassed: true,
      atomicRemoteSlotProjection: true,
      draftPreserved: true,
      previewPreserved: true,
      focusPreserved: true,
      refreshOnFocus: true,
      refreshOnVisibility: true,
      refreshOnOnline: true,
      refreshAfterMutationSuccess: true,
      noFullPageReload: true,
    }),
  });
}

if (browser()) mountIncidenciasDetailLiveSync();

export default Object.freeze({
  version: INCIDENCIAS_DETAIL_LIVE_SYNC_VERSION,
  mount: mountIncidenciasDetailLiveSync,
  destroy: destroyIncidenciasDetailLiveSync,
  getSnapshot: getIncidenciasDetailLiveSyncSnapshot,
});

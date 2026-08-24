/* =========================================================
   Onion Support · Incidencias Detail Live Sync
   Archivo: /src/features/incidencias-detail-live-sync/index.js

   Frescura del Modal Details sin polling agresivo:
   - stale-while-revalidate al abrir: pinta lo disponible y valida servidor;
   - NO ejecuta un interval/timer de polling continuo;
   - usa señales naturales de invalidación: cambio del row/listado, mutación
     confirmada, vuelta a foco/pestaña y recuperación de conectividad;
   - focus/visibility/online sólo revalidan si el detalle ya está stale;
   - la lista ya tiene su propia actualización de baja frecuencia y actúa como
     coarse change feed: sólo si cambia el row activo se consulta el detalle;
   - después de escribir hay una única confirmación read-after-write diferida;
   - proyecta únicamente datos remotos y preserva borrador, adjuntos pendientes,
     foco, visor de archivos y confirmaciones del usuario;
   - el indicador aparece sólo si la red tarda y nunca fuerza un repintado vacío.

   Patrón equivalente a clientes de datos modernos: cache inmediata +
   invalidación/revalidación por señales, con polling periódico desactivado.
========================================================= */

export const INCIDENCIAS_DETAIL_LIVE_SYNC_VERSION =
  "incidencias-detail-live-sync.v2.signal-driven-swr";

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
const ROW = "[data-ticket-row='true']";

const STALE_AFTER_MS = 20_000;
const WAKE_DEDUPE_MS = 4_000;
const MUTATION_CONFIRM_DELAY_MS = 650;
const LIST_SIGNAL_DEBOUNCE_MS = 120;
const INDICATOR_DELAY_MS = 450;
const INDICATOR_SETTLE_MS = 900;
const ERROR_SETTLE_MS = 1_600;

let mounted = false;
let mountRoot = null;
let host = null;
let viewObserver = null;
let modalObserver = null;
let frame = 0;
let mutationConfirmTimer = 0;
let listSignalTimer = 0;
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
let lastListFingerprint = "";
let lastSyncedAt = 0;
let lastWakeAt = 0;
let lastError = null;
let syncCount = 0;
let changeCount = 0;
let signalRefreshCount = 0;

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

function isStale() {
  return !lastSyncedAt || Date.now() - lastSyncedAt >= STALE_AFTER_MS;
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

function clearTimer(name = "") {
  if (!browser()) return false;

  const map = {
    mutation: mutationConfirmTimer,
    list: listSignalTimer,
    indicatorDelay: indicatorDelayTimer,
    indicatorSettle: indicatorSettleTimer,
  };

  const id = Number(map[name] || 0);
  if (!id) return false;

  window.clearTimeout(id);

  if (name === "mutation") mutationConfirmTimer = 0;
  if (name === "list") listSignalTimer = 0;
  if (name === "indicatorDelay") indicatorDelayTimer = 0;
  if (name === "indicatorSettle") indicatorSettleTimer = 0;
  return true;
}

function clearIndicatorTimers() {
  clearTimer("indicatorDelay");
  clearTimer("indicatorSettle");
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
  label.textContent = "Actualizando…";

  live.append(spinner, label);
  ownMutation(() => panel.appendChild(live));
  return live;
}

function showIndicator(root, state, label) {
  if (!root?.isConnected) return false;

  const live = ensureIndicator(root);
  const labelNode = live?.querySelector?.("[data-live-sync-label='true']");
  if (!live || !labelNode) return false;

  live.dataset.state = state;
  live.hidden = false;
  labelNode.textContent = label;
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

  indicatorDelayTimer = window.setTimeout(() => {
    indicatorDelayTimer = 0;

    if (
      root.isConnected &&
      root === currentRoot() &&
      root.dataset.liveSyncState === "syncing"
    ) {
      showIndicator(root, "syncing", "Actualizando…");
    }
  }, INDICATOR_DELAY_MS);
}

function finishIndicator(root, { changed = false, error = false } = {}) {
  if (!root?.isConnected) return;

  const wasVisible = Boolean(root.querySelector(`${LIVE}:not([hidden])`));
  clearTimer("indicatorDelay");
  clearTimer("indicatorSettle");

  if (error) {
    root.dataset.liveSyncState = "error";

    if (wasVisible) {
      showIndicator(root, "error", "No se pudo actualizar");
      indicatorSettleTimer = window.setTimeout(() => {
        indicatorSettleTimer = 0;
        if (!root.isConnected || root !== currentRoot()) return;
        hideIndicator(root);
        root.dataset.liveSyncState = "idle";
      }, ERROR_SETTLE_MS);
    }

    return;
  }

  root.dataset.liveSyncState = "ready";

  if (!changed) {
    hideIndicator(root);
    root.dataset.liveSyncState = "idle";
    return;
  }

  showIndicator(root, "ready", "Contenido actualizado");
  indicatorSettleTimer = window.setTimeout(() => {
    indicatorSettleTimer = 0;
    if (!root.isConnected || root !== currentRoot()) return;
    hideIndicator(root);
    root.dataset.liveSyncState = "idle";
  }, INDICATOR_SETTLE_MS);
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
  nextThread.setAttribute(
    "aria-label",
    "Comentarios y seguimiento de la incidencia"
  );

  const head = document.createElement("div");
  head.className = "incidencias-modal-description-thread-head";

  const title = document.createElement("strong");
  title.textContent = "Seguimiento";

  const count = document.createElement("span");
  count.textContent =
    `${comments.length} comentario${comments.length === 1 ? "" : "s"}`;

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
     Una sola transacción DOM para datos remotos. No se toca feedback, preview,
     composer, textarea, input file ni overlays de confirmación.
  */
  ownMutation(() => {
    for (const selector of [
      "[data-modal-updated='true']",
      ".incidencias-modal-meta-grid",
      ".incidencias-modal-contact-section",
    ]) {
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

function rowForTicket(id = activeTicketId) {
  if (!mountRoot || !id) return null;

  for (const row of mountRoot.querySelectorAll(ROW)) {
    const rowId = text(row.dataset?.ticketId || row.dataset?.incidenciaId, "");
    if (rowId === id) return row;
  }

  return null;
}

function rowFingerprint(row = null) {
  if (!row) return "";

  const dataset = Object.entries(row.dataset || {})
    .filter(([key]) => !/loading|busy|opening/i.test(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${text(value, "")}`)
    .join("|");

  const copy = text(row.textContent, "");
  return `${dataset}###${copy}`;
}

function captureListFingerprint() {
  lastListFingerprint = rowFingerprint(rowForTicket());
  return lastListFingerprint;
}

function scheduleListSignalCheck() {
  if (!browser() || !mounted || !activeTicketId) return false;

  clearTimer("list");
  listSignalTimer = window.setTimeout(() => {
    listSignalTimer = 0;

    if (!activeTicketId || !pageVisible()) return;

    const next = rowFingerprint(rowForTicket());
    if (!next) return;

    if (!lastListFingerprint) {
      lastListFingerprint = next;
      return;
    }

    if (next === lastListFingerprint) return;

    lastListFingerprint = next;
    signalRefreshCount += 1;
    void refreshDetail(activeTicketId, {
      reason: "list-change",
      force: true,
    });
  }, LIST_SIGNAL_DEBOUNCE_MS);

  return true;
}

function abortRequest() {
  requestSeq += 1;
  try { requestController?.abort?.(); } catch { /* noop */ }
  requestController = null;
  inflight = null;
}

function shouldRefresh(reason = "signal", force = false) {
  if (force) return true;

  return ["open", "mutation-success", "list-change"].includes(reason) || isStale();
}

async function refreshDetail(
  id = "",
  { reason = "signal", force = false } = {}
) {
  const cleanId = text(id, "");
  const root = currentRoot();

  if (
    !cleanId ||
    !root?.isConnected ||
    ticketId(root) !== cleanId ||
    rootBusy(root) ||
    !pageVisible() ||
    !shouldRefresh(reason, force)
  ) {
    return false;
  }

  if (inflight?.ticketId === cleanId && inflight?.promise) {
    return inflight.promise;
  }

  const sequence = ++requestSeq;
  const controller =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

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

      if (changed) changeCount += 1;

      root.dataset.liveSyncLastSuccessAt = new Date(lastSyncedAt).toISOString();
      root.dataset.liveSyncReason = text(reason, "signal");
      captureListFingerprint();
      finishIndicator(root, { changed, error: false });
      return true;
    } catch (error) {
      if (sequence !== requestSeq) return false;

      if (error?.name !== "AbortError") {
        lastError = error || new Error("LIVE_SYNC_FAILED");
        finishIndicator(root, { error: true });
      }

      return false;
    } finally {
      if (sequence === requestSeq) {
        requestController = null;
        inflight = null;
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

function scheduleMutationConfirmation(id = activeTicketId) {
  if (!browser() || !id) return false;

  clearTimer("mutation");
  mutationConfirmTimer = window.setTimeout(() => {
    mutationConfirmTimer = 0;

    if (
      activeTicketId === id &&
      currentRoot()?.isConnected &&
      !rootBusy(currentRoot())
    ) {
      signalRefreshCount += 1;
      void refreshDetail(id, {
        reason: "mutation-success",
        force: true,
      });
    }
  }, MUTATION_CONFIRM_DELAY_MS);

  return true;
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
  clearTimer("mutation");
  clearTimer("list");
  clearIndicatorTimers();
  abortRequest();

  activeRoot = null;
  activeTicketId = "";
  lastDetail = null;
  lastSignature = "";
  lastSuccessKey = "";
  lastListFingerprint = "";
  lastSyncedAt = 0;
  lastWakeAt = 0;
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
    abortRequest();
    activeRoot = root;
    activeTicketId = id;
    lastDetail = null;
    lastSignature = "";
    lastSuccessKey = successKey(root);
    lastListFingerprint = rowFingerprint(rowForTicket(id));
    lastSyncedAt = 0;
    lastWakeAt = 0;
    lastError = null;

    /* SWR: contenido local visible, validación servidor en background. */
    signalRefreshCount += 1;
    void refreshDetail(id, { reason: "open", force: true });
    return true;
  }

  const currentSuccessKey = successKey(root);
  if (currentSuccessKey && currentSuccessKey !== lastSuccessKey) {
    lastSuccessKey = currentSuccessKey;
    scheduleMutationConfirmation(id);
  }

  return true;
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

function onWake(event = null) {
  if (!mounted || !pageVisible() || !activeTicketId) return;

  const now = Date.now();
  if (now - lastWakeAt < WAKE_DEDUPE_MS) return;
  lastWakeAt = now;

  const reason = event?.type === "online"
    ? "online"
    : event?.type === "visibilitychange"
      ? "visibility"
      : "focus";

  if (!isStale()) return;

  signalRefreshCount += 1;
  void refreshDetail(activeTicketId, { reason, force: false });
}

export function mountIncidenciasDetailLiveSync() {
  if (!browser() || mounted) return false;

  mountRoot = document.querySelector(VIEW) || document.body;
  if (!mountRoot || typeof MutationObserver === "undefined") return false;

  mounted = true;

  viewObserver = new MutationObserver((mutations) => {
    if (internalMutations) return;

    let modalTouched = false;
    let listTouched = false;

    for (const mutation of mutations) {
      for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
        if (node?.nodeType !== 1) continue;

        if (
          node.matches?.(HOST) ||
          node.matches?.(ROOT) ||
          node.querySelector?.(HOST) ||
          node.querySelector?.(ROOT)
        ) {
          modalTouched = true;
        }

        if (
          node.matches?.(ROW) ||
          node.querySelector?.(ROW)
        ) {
          listTouched = true;
        }
      }
    }

    if (modalTouched) schedule();
    if (listTouched || activeTicketId) scheduleListSignalCheck();
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
    signalRefreshCount,
    hasError: Boolean(lastError),
    staleAfterMs: STALE_AFTER_MS,
    policy: Object.freeze({
      staleWhileRevalidate: true,
      forceServerRevalidationOnOpen: true,
      periodicPolling: false,
      signalDriven: true,
      listActsAsCoarseChangeFeed: true,
      refreshOnListChange: true,
      refreshAfterMutationSuccess: true,
      readAfterWriteDelayMs: MUTATION_CONFIRM_DELAY_MS,
      refreshOnFocusWhenStale: true,
      refreshOnVisibilityWhenStale: true,
      refreshOnOnlineWhenStale: true,
      wakeDedupeMs: WAKE_DEDUPE_MS,
      slowRequestIndicatorDelayMs: INDICATOR_DELAY_MS,
      unchangedRequestsRemainSilent: true,
      retryLoop: false,
      atomicRemoteSlotProjection: true,
      draftPreserved: true,
      previewPreserved: true,
      focusPreserved: true,
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

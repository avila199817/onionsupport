/* =========================================================
   Onion Support · Incidencias Detail Live Sync

   Signals and perceptible refresh feedback for the shared detail controller.
   The controller alone fetches data, owns mutations and projects modal slots.
========================================================= */

import {
  commentsFromDetail,
  commentSignature,
} from "../incidencias-detail-state/index.js";

export const INCIDENCIAS_DETAIL_LIVE_SYNC_VERSION =
  "incidencias-detail-live-sync.v4.controller-signals";

const VIEW = "#view-container, [data-router-view='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const PANEL = "[data-incidencias-modal-panel='true']";
const LIVE = "[data-detail-live-sync='true']";
const ROW = "[data-ticket-row='true']";
const STALE_AFTER_MS = 20_000;
const WAKE_DEDUPE_MS = 4_000;
const LIST_SIGNAL_DEBOUNCE_MS = 120;
const INDICATOR_DELAY_MS = 450;
const INDICATOR_SETTLE_MS = 900;
const ERROR_SETTLE_MS = 1_600;

let mounted = false;
let mountRoot = null;
let host = null;
let owner = null;
let viewObserver = null;
let listSignalTimer = 0;
let indicatorDelayTimer = 0;
let indicatorSettleTimer = 0;
let inflight = null;
let activeTicketId = "";
let lastDetail = null;
let lastSignature = "";
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

function clearTimer(name = "") {
  if (!browser()) return false;

  const map = {
    list: listSignalTimer,
    indicatorDelay: indicatorDelayTimer,
    indicatorSettle: indicatorSettleTimer,
  };

  const id = Number(map[name] || 0);
  if (!id) return false;

  window.clearTimeout(id);

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
  panel.appendChild(live);

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

function attachmentsFromDetail(detail = {}) {
  const raw = object(first(detail?.raw, detail));

  return array(
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
}

function attachmentDetailSignature(detail = {}) {
  return attachmentsFromDetail(detail)
    .map((file, index) => [
      text(
        file?.id ||
        file?.attachmentId ||
        file?.fileId ||
        `att_${index}`
      ),
      text(file?.name || file?.filename || file?.fileName, ""),
      text(
        file?.contentType ||
        file?.type ||
        file?.mimeType ||
        file?.mimetype,
        ""
      ).toLowerCase(),
      Number(file?.size || file?.sizeBytes || 0),
      timestamp(file?.uploadedAt || file?.createdAt || file?.updatedAt),
    ].join("::"))
    .join("||");
}

function detailSignature(detail = {}) {
  const raw = object(first(detail?.raw, detail));
  const comments = commentsFromDetail(detail);

  return [
    text(detail?.status || detail?.estado, ""),
    text(detail?.priority || detail?.prioridad, ""),
    text(detail?.category || detail?.categoria || detail?.type, ""),
    text(
      first(
        detail?.assignedToName,
        detail?.technicianName,
        detail?.tecnicoName,
        raw?.assignedToName,
        raw?.technicianName,
        ""
      ),
      ""
    ),
    timestamp(detail?.lastActivityAt || detail?.updatedAt),
    commentSignature(comments),
    attachmentDetailSignature(detail),
  ].join("###");
}

function rowForTicket(id = activeTicketId) {
  if (!mountRoot || !id) return null;

  for (const row of mountRoot.querySelectorAll(ROW)) {
    const rowId = text(
      row.dataset?.ticketId || row.dataset?.incidenciaId,
      ""
    );

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

async function refreshDetail(id, { reason = "signal", force = false } = {}) {
  const root = currentRoot();
  const controller = owner?.controller;
  const modalHost = host;
  if (
    !controller?.refreshDetail || !id || id !== activeTicketId ||
    !root?.isConnected || rootBusy(root) || !pageVisible() ||
    owner.loading || (!force && !isStale())
  ) return false;

  if (inflight) return inflight;
  const previousSignature = lastSignature;
  beginIndicator(root);

  const pending = Promise.resolve().then(() => controller.refreshDetail({
    force: true,
    silent: true,
    reason,
  }));
  inflight = pending;

  try {
    const detail = await pending;
    if (owner?.controller !== controller || host !== modalHost || activeTicketId !== id) return false;
    const current = currentRoot();
    finishIndicator(current, {
      changed: Boolean(detail && previousSignature && previousSignature !== lastSignature),
      error: Boolean(lastError),
    });
    if (current) current.dataset.liveSyncReason = reason;
    return Boolean(detail);
  } catch (error) {
    if (owner?.controller === controller && host === modalHost && activeTicketId === id) {
      lastError = error;
      finishIndicator(currentRoot(), { error: true });
    }
    return false;
  } finally {
    if (inflight === pending) inflight = null;
  }
}

function resetActive() {
  clearTimer("list");
  clearIndicatorTimers();
  inflight = null;
  activeTicketId = "";
  lastDetail = null;
  lastSignature = "";
  lastListFingerprint = "";
  lastSyncedAt = 0;
  lastWakeAt = 0;
  lastError = null;
}

/** Record the same authoritative response already rendered by the controller. */
export function syncIncidenciasDetailLiveSync(payload = {}) {
  if (!browser()) return false;
  mountIncidenciasDetailLiveSync();
  const nextHost = payload.modalHost || null;
  const nextId = text(payload.id || ticketId(nextHost?.querySelector?.(ROOT)), "");
  if (host !== nextHost || owner?.controller !== payload.controller || activeTicketId !== nextId || !payload.open) {
    resetActive();
  }
  host = nextHost;
  owner = payload;
  if (!payload.open || !nextId) return false;
  activeTicketId = nextId;

  if (payload.error) lastError = payload.error;
  if (payload.loading || payload.error || !payload.detail) return false;

  if (payload.detail !== lastDetail || !lastSyncedAt) {
    const signature = detailSignature(payload.detail);
    if (lastSignature && signature !== lastSignature) changeCount += 1;
    lastDetail = payload.detail;
    lastSignature = signature;
    lastSyncedAt = Date.now();
    lastError = null;
    syncCount += 1;
    const root = currentRoot();
    if (root) root.dataset.liveSyncLastSuccessAt = new Date(lastSyncedAt).toISOString();
    captureListFingerprint();
  }
  return true;
}

function onWake(event = null) {
  if (!mounted || !pageVisible() || !activeTicketId) return;
  const now = Date.now();
  if (now - lastWakeAt < WAKE_DEDUPE_MS) return;
  lastWakeAt = now;
  if (!isStale()) return;
  signalRefreshCount += 1;
  void refreshDetail(activeTicketId, {
    reason: event?.type === "online" ? "online" : event?.type === "visibilitychange" ? "visibility" : "focus",
  });
}

export function mountIncidenciasDetailLiveSync() {
  if (!browser()) return false;
  if (mounted) return true;
  mountRoot = document.querySelector(VIEW) || document.body;
  if (!mountRoot) return false;
  mounted = true;
  if (typeof MutationObserver !== "undefined") {
    viewObserver = new MutationObserver(() => {
      if (activeTicketId) scheduleListSignalCheck();
    });
    viewObserver.observe(mountRoot, { childList: true, subtree: true });
  }
  window.addEventListener("focus", onWake);
  window.addEventListener("online", onWake);
  document.addEventListener("visibilitychange", onWake);
  return true;
}

export function destroyIncidenciasDetailLiveSync() {
  if (!browser()) return false;
  resetActive();
  viewObserver?.disconnect?.();
  viewObserver = null;
  window.removeEventListener("focus", onWake);
  window.removeEventListener("online", onWake);
  document.removeEventListener("visibilitychange", onWake);
  mounted = false;
  host = null;
  owner = null;
  mountRoot = null;
  return true;
}

export function getIncidenciasDetailLiveSyncSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_DETAIL_LIVE_SYNC_VERSION,
    mounted,
    ticketId: activeTicketId ? "***" : "",
    syncing: Boolean(inflight),
    controllerOwned: Boolean(owner?.controller),
    lastSyncedAt: lastSyncedAt ? new Date(lastSyncedAt).toISOString() : null,
    syncCount,
    changeCount,
    signalRefreshCount,
    hasError: Boolean(lastError),
    staleAfterMs: STALE_AFTER_MS,
    policy: Object.freeze({
      dataAndRenderingAuthority: "shared_detail_controller",
      forceServerRevalidationOnOpen: true,
      periodicPolling: false,
      signalDriven: true,
      listActsAsCoarseChangeFeed: true,
      refreshOnListChange: true,
      mutationAuthority: "shared_detail_controller",
      refreshOnFocusWhenStale: true,
      refreshOnVisibilityWhenStale: true,
      refreshOnOnlineWhenStale: true,
      wakeDedupeMs: WAKE_DEDUPE_MS,
      slowRequestIndicatorDelayMs: INDICATOR_DELAY_MS,
      unchangedRequestsRemainSilent: true,
      retryLoop: false,
      draftPreserved: true,
      previewPreserved: true,
      focusPreserved: true,
      noFullPageReload: true,
    }),
  });
}

export default Object.freeze({
  version: INCIDENCIAS_DETAIL_LIVE_SYNC_VERSION,
  mount: mountIncidenciasDetailLiveSync,
  sync: syncIncidenciasDetailLiveSync,
  destroy: destroyIncidenciasDetailLiveSync,
  getSnapshot: getIncidenciasDetailLiveSyncSnapshot,
});

/* =========================================================
   Onion Support · Incidencias Media Preview
   Archivo: /src/features/incidencias-media-preview/index.js

   Mejora progresiva UI-only:
   - miniaturas locales de adjuntos pendientes;
   - recuperación de miniaturas remotas mediante el /view canónico;
   - sin mutar tickets, File, payloads, permisos ni contratos HTTP;
   - observer de lista limitado al mount estable del Router;
   - observer del detalle limitado a la isla real del modal;
   - CSS propiedad del manifest canónico de src/router/styles.js.
========================================================= */

export const INCIDENCIAS_MEDIA_PREVIEW_VERSION =
  "incidencias-media-preview.v4-modal-island";

const VIEW = "#view-container, [data-router-view='true']";
const MODAL_HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const INPUT = `${ROOT} input[data-detail-field='attachments'], ${ROOT} input[data-field='attachments'][type='file']`;
const DROPZONE = `${ROOT} [data-dropzone='detail-attachments']`;
const REMOVE = `${ROOT} [data-detail-action='detail-pending-file-remove']`;
const MAX_FILES = 10;
const MAX_SIZE = 100 * 1024 * 1024;
const FAILURE_COOLDOWN = 60_000;
const DEFAULT_TTL = 4 * 60_000;
const EXPIRY_GUARD = 30_000;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i;

const pending = { order: [], entries: new Map() };
const boundImages = new WeakSet();
const remoteCache = new Map();
const remoteInflight = new Map();
const remoteFailureAt = new Map();

let observer = null;
let modalObserver = null;
let observedModalHost = null;
let frame = 0;
let lastRoot = null;
let apiPromise = null;
let remoteEpoch = 0;
let mounted = false;
let mountRoot = null;

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";
const text = (value = "", fallback = "") =>
  String(value ?? "").replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim() || fallback;
const array = (value) => {
  try { return value ? Array.from(value) : []; } catch { return []; }
};
const fileLike = (file) => Boolean(
  file &&
  typeof file === "object" &&
  typeof file.name === "string" &&
  typeof file.size === "number" &&
  (
    typeof file.arrayBuffer === "function" ||
    typeof file.stream === "function" ||
    typeof file.slice === "function"
  )
);
const signature = (file = {}) => [
  text(file.name, "archivo"),
  Number(file.size || 0),
  Number(file.lastModified || 0),
  text(file.type).toLowerCase(),
].join("::");
const imageFile = (file = {}) =>
  text(file.type).toLowerCase().startsWith("image/") || IMAGE_RE.test(text(file.name));
const labelFor = (file = {}) => {
  if (imageFile(file)) return "IMG";
  const name = text(file.name).toLowerCase();
  const dot = name.lastIndexOf(".");
  if (dot > 0) return name.slice(dot + 1).slice(0, 4).toUpperCase();
  return text(file.type).includes("pdf") ? "PDF" : "DOC";
};

function viewRoot() {
  return browser() ? document.querySelector(VIEW) : null;
}

function objectUrl(file) {
  if (!browser() || !imageFile(file)) return "";
  try { return window.URL?.createObjectURL?.(file) || ""; } catch { return ""; }
}

function revoke(url = "") {
  if (!browser() || !String(url).startsWith("blob:")) return;
  try { window.URL?.revokeObjectURL?.(url); } catch { /* noop */ }
}

function clearPending() {
  for (const item of pending.entries.values()) revoke(item.url);
  pending.entries.clear();
  pending.order = [];
}

function clearRemote() {
  remoteEpoch += 1;
  remoteCache.clear();
  remoteInflight.clear();
  remoteFailureAt.clear();
}

function registerFiles(values) {
  const files = array(values).filter(fileLike);
  if (!files.length || files.some((file) => Number(file.size || 0) > MAX_SIZE)) {
    return false;
  }

  const seen = new Set(pending.order);
  const incoming = [];

  for (const file of files) {
    const key = signature(file);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    incoming.push({ key, file });
  }

  if (pending.order.length + incoming.length > MAX_FILES) return false;

  for (const { key, file } of incoming) {
    pending.entries.set(key, {
      key,
      file,
      image: imageFile(file),
      label: labelFor(file),
      url: objectUrl(file),
    });
    pending.order.push(key);
  }

  schedule();
  return incoming.length > 0;
}

function removePending(index) {
  const pos = Number(index);
  if (!Number.isInteger(pos) || pos < 0 || pos >= pending.order.length) return false;

  const key = pending.order[pos];
  revoke(pending.entries.get(key)?.url);
  pending.entries.delete(key);
  pending.order.splice(pos, 1);
  return true;
}

function imageState(img, state) {
  const box = img?.closest?.(
    "[data-local-preview-frame='true'], [data-modal-thumb-frame='true']"
  );
  if (!box) return false;

  box.dataset.previewState = state;
  box.dataset.thumbError = state === "error" ? "true" : "false";
  return true;
}

function bindImage(img, remote = false) {
  if (!img || boundImages.has(img)) return false;
  boundImages.add(img);
  imageState(img, "loading");

  const loaded = () => imageState(
    img,
    img.naturalWidth > 0 && img.naturalHeight > 0 ? "ready" : "error"
  );
  const failed = () => {
    imageState(img, "error");
    if (remote) void refreshRemoteImage(img);
  };

  img.addEventListener("load", loaded);
  img.addEventListener("error", failed);
  if (img.complete) queueMicrotask(() => img.isConnected && loaded());
  return true;
}

function localThumb(item, index) {
  const box = document.createElement("span");
  box.className = "incidencias-modal-pending-thumb";
  box.dataset.localPreviewFrame = "true";
  box.dataset.fileSignature = item.key;
  box.dataset.fileIndex = String(index);
  box.dataset.previewState = item.image && item.url ? "loading" : "fallback";

  const fallback = document.createElement("span");
  fallback.className = "incidencias-modal-pending-thumb-fallback";
  fallback.textContent = item.label;
  fallback.setAttribute("aria-hidden", "true");
  box.appendChild(fallback);

  if (item.image && item.url) {
    const img = document.createElement("img");
    img.className = "incidencias-modal-pending-thumb-image";
    img.src = item.url;
    img.alt = text(item.file.name, "Imagen adjunta");
    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;
    box.appendChild(img);
    bindImage(img);
  }

  return box;
}

function syncPending(root) {
  const rows = [
    ...root.querySelectorAll(".incidencias-modal-pending-file[data-file-index]"),
  ];

  if (!rows.length) {
    if (pending.order.length) clearPending();
    return;
  }

  for (const row of rows) {
    const index = Number(row.dataset.fileIndex ?? -1);
    const key = Number.isInteger(index) ? pending.order[index] : "";
    const item = key ? pending.entries.get(key) : null;
    const current = row.querySelector("[data-local-preview-frame='true']");

    if (!item) {
      current?.remove?.();
      row.dataset.mediaPreviewEnhanced = "false";
      continue;
    }

    row.dataset.mediaPreviewEnhanced = "true";
    if (current?.dataset.fileSignature === key) continue;
    current?.remove?.();
    row.insertBefore(localThumb(item, index), row.firstChild);
  }
}

function syncSlots(root) {
  const feedback = root.querySelector("[data-modal-feedback-slot='true']");
  if (feedback) {
    feedback.dataset.slotEmpty = feedback.querySelector(".incidencias-modal-feedback")
      ? "false"
      : "true";
  }

  const preview = root.querySelector("[data-modal-preview-slot='true']");
  if (preview) {
    preview.dataset.slotEmpty = preview.querySelector(".incidencias-modal-preview")
      ? "false"
      : "true";
  }
}

const remoteKey = (ticketId, attachmentId) =>
  text(ticketId) && text(attachmentId)
    ? `${text(ticketId)}::${text(attachmentId)}`
    : "";

function expiry(url) {
  try {
    const se = new URL(url, window.location.origin).searchParams.get("se");
    const time = se ? Date.parse(se) : NaN;
    return Number.isFinite(time) ? time : Date.now() + DEFAULT_TTL;
  } catch {
    return Date.now() + DEFAULT_TTL;
  }
}

function cached(key) {
  const item = remoteCache.get(key);
  if (!item?.url) return "";

  if (item.expiresAt <= Date.now() + EXPIRY_GUARD) {
    remoteCache.delete(key);
    return "";
  }

  return item.url;
}

const api = () =>
  apiPromise ||= import("../../views/incidencias/incidencias.api.js");
const viewUrl = (file = {}) =>
  text(file.viewUrl || file.openUrl || file.signedUrl || file.sasUrl || file.url);

async function requestUrl(ticketId, attachmentId, force = false) {
  const key = remoteKey(ticketId, attachmentId);
  if (!key) return "";

  if (!force) {
    const hit = cached(key);
    if (hit) return hit;
  }

  const failed = Number(remoteFailureAt.get(key) || 0);
  if (failed && Date.now() - failed < FAILURE_COOLDOWN) return "";
  if (remoteInflight.has(key)) return remoteInflight.get(key);

  const epoch = remoteEpoch;
  const task = (async () => {
    try {
      const file = await (await api()).openIncidenciaAttachment({
        ticketId,
        attachmentId,
      });
      const url = viewUrl(file);
      if (!url || epoch !== remoteEpoch) return "";

      remoteCache.set(key, { url, expiresAt: expiry(url) });
      remoteFailureAt.delete(key);
      return url;
    } catch {
      if (epoch === remoteEpoch) remoteFailureAt.set(key, Date.now());
      return "";
    } finally {
      if (epoch === remoteEpoch) remoteInflight.delete(key);
    }
  })();

  remoteInflight.set(key, task);
  return task;
}

function decorate(frameNode, img) {
  if (!frameNode || !img) return;

  if (boundImages.has(img)) {
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      imageState(img, "ready");
    }
    return;
  }

  frameNode.dataset.previewState = "loading";
  frameNode.dataset.thumbError = "false";
  bindImage(img, true);
}

function installRemoteThumb(button, url) {
  if (!button?.isConnected || !url) return false;

  const id = text(button.dataset.attachmentId);
  const name = text(button.getAttribute("aria-label"), "Imagen adjunta")
    .replace(/^Ver\s+/i, "")
    .replace(/^Ampliar\s+/i, "");

  button.classList.remove("incidencias-modal-file-square");
  button.classList.add("incidencias-modal-image-thumb-wrap");
  Object.assign(button.dataset, {
    renderableThumbnail: "true",
    modalThumbFrame: "true",
    previewState: "loading",
    thumbError: "false",
    attachmentId: id,
  });

  const img = document.createElement("img");
  img.className = "incidencias-modal-image-thumb";
  img.src = url;
  img.alt = name;
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.draggable = false;
  img.dataset.modalThumbImg = "true";

  const fallback = document.createElement("span");
  fallback.className = "incidencias-modal-image-thumb-fallback";
  fallback.textContent = "IMG";

  const badge = document.createElement("span");
  badge.className = "incidencias-modal-image-open-badge";
  badge.textContent = "Ver";

  button.replaceChildren(img, fallback, badge);
  decorate(button, img);
  return true;
}

async function hydrateFallback(button) {
  if (!button?.isConnected || button.dataset.thumbnailHydrating === "true") return;
  if (text(button.querySelector(":scope > span")?.textContent).toUpperCase() !== "IMG") {
    return;
  }

  const root = button.closest(ROOT);
  const ticketId = text(root?.dataset.ticketId);
  const attachmentId = text(button.dataset.attachmentId);
  if (!remoteKey(ticketId, attachmentId)) return;

  button.dataset.thumbnailHydrating = "true";
  const url = await requestUrl(ticketId, attachmentId);

  if (!button.isConnected || text(root?.dataset.ticketId) !== ticketId) return;
  button.dataset.thumbnailHydrating = "false";

  if (!url) {
    button.dataset.previewState = "error";
    return;
  }

  installRemoteThumb(button, url);
}

async function refreshRemoteImage(img) {
  if (!img?.isConnected) return;

  const box = img.closest("[data-modal-thumb-frame='true']");
  const root = img.closest(ROOT);
  const ticketId = text(root?.dataset.ticketId);
  const attachmentId = text(box?.dataset.attachmentId);
  const key = remoteKey(ticketId, attachmentId);
  if (!box || !key || box.dataset.thumbnailRefreshing === "true") return;

  box.dataset.thumbnailRefreshing = "true";
  box.dataset.previewState = "error";
  remoteCache.delete(key);

  const url = await requestUrl(ticketId, attachmentId, true);
  box.dataset.thumbnailRefreshing = "false";
  if (!url || !img.isConnected) return;

  box.dataset.previewState = "loading";
  img.src = url;
}

function syncRemote(root) {
  for (const box of root.querySelectorAll("[data-modal-thumb-frame='true']")) {
    const img = box.querySelector("[data-modal-thumb-img='true']");
    if (img) decorate(box, img);
  }

  for (const button of root.querySelectorAll(
    ".incidencias-modal-file-square[data-renderable-thumbnail='false']"
  )) {
    void hydrateFallback(button);
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
    modalObserver.observe(observedModalHost, { childList: true, subtree: true });
  }

  return Boolean(observedModalHost);
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return;

  syncModalObserver();

  const root = observedModalHost?.querySelector?.(ROOT) || null;
  if (!root) {
    if (lastRoot) {
      clearPending();
      clearRemote();
    }
    lastRoot = null;
    return;
  }

  if (lastRoot && lastRoot !== root) {
    clearPending();
    clearRemote();
  }

  lastRoot = root;
  syncSlots(root);
  syncPending(root);
  syncRemote(root);
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

function onChange(event) {
  const input = event.target?.closest?.(INPUT);
  if (input) registerFiles(input.files);
}

function onDrop(event) {
  const zone = event.target?.closest?.(DROPZONE);
  if (zone) registerFiles(event.dataTransfer?.files);
}

function onClick(event) {
  const button = event.target?.closest?.(REMOVE);
  if (button) {
    removePending(
      Number(button.dataset.fileIndex ?? button.dataset.removeAttachment ?? -1)
    );
  }

  schedule();
}

export function mountIncidenciasMediaPreview() {
  if (!browser() || mounted) return false;

  const root = viewRoot();
  if (!root || typeof MutationObserver === "undefined") return false;

  mounted = true;
  mountRoot = root;

  document.addEventListener("change", onChange, true);
  document.addEventListener("drop", onDrop, true);
  document.addEventListener("click", onClick, true);

  observer = new MutationObserver(schedule);
  observer.observe(mountRoot, { childList: true, subtree: true });
  schedule();
  return true;
}

export function destroyIncidenciasMediaPreview() {
  if (!browser() || !mounted) return false;

  mounted = false;
  document.removeEventListener("change", onChange, true);
  document.removeEventListener("drop", onDrop, true);
  document.removeEventListener("click", onClick, true);

  observer?.disconnect?.();
  modalObserver?.disconnect?.();
  observer = null;
  modalObserver = null;
  observedModalHost = null;

  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;

  clearPending();
  clearRemote();
  lastRoot = null;
  mountRoot = null;
  return true;
}

export function getIncidenciasMediaPreviewSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_MEDIA_PREVIEW_VERSION,
    mounted,
    observerScope: "router-view",
    modalObserverScope: "incidencias-modal-host",
    cssAuthority: "router-styles",
    pendingFiles: pending.order.length,
    remoteCacheEntries: remoteCache.size,
    modalMounted: Boolean(lastRoot?.isConnected),
  });
}

if (browser()) mountIncidenciasMediaPreview();

export default Object.freeze({
  version: INCIDENCIAS_MEDIA_PREVIEW_VERSION,
  mount: mountIncidenciasMediaPreview,
  destroy: destroyIncidenciasMediaPreview,
  getSnapshot: getIncidenciasMediaPreviewSnapshot,
});

/* =========================================================
   Onion Support · Incidencias Media Preview
   Archivo: /src/features/incidencias-media-preview/index.js

   MEDIA THUMBNAILS · V5 · DECODED IMAGE CACHE
   - miniaturas locales de adjuntos pendientes;
   - miniaturas remotas exclusivamente por /view canónico cuando hace falta;
   - caché de URL SAS con expiración;
   - caché visual LRU del <img> ya decodificado;
   - si el controller reconstruye una tarjeta, el mismo nodo de imagen se
     reinyecta desde MutationObserver antes del siguiente paint;
   - un refresh ajeno a adjuntos no debe provocar placeholder/flicker;
   - error remoto revalida una sola fuente canónica sin exponer blob privado;
   - sin mutar tickets, File, payloads, permisos ni contratos HTTP.
========================================================= */

export const INCIDENCIAS_MEDIA_PREVIEW_VERSION =
  "incidencias-media-preview.v5.decoded-image-cache";

const VIEW = "#view-container, [data-router-view='true']";
const MODAL_HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const INPUT =
  `${ROOT} input[data-detail-field='attachments'], ` +
  `${ROOT} input[data-field='attachments'][type='file']`;
const DROPZONE = `${ROOT} [data-dropzone='detail-attachments']`;
const REMOVE = `${ROOT} [data-detail-action='detail-pending-file-remove']`;

const REMOTE_FRAME = "[data-modal-thumb-frame='true']";
const REMOTE_IMG = "[data-modal-thumb-img='true']";
const REMOTE_FALLBACK =
  ".incidencias-modal-file-square[data-renderable-thumbnail='false']";

const MAX_FILES = 10;
const MAX_SIZE = 100 * 1024 * 1024;
const FAILURE_COOLDOWN = 60_000;
const DEFAULT_TTL = 15 * 60_000;
const EXPIRY_GUARD = 45_000;
const MAX_VISUAL_CACHE = 64;
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i;

const pending = {
  order: [],
  entries: new Map(),
};

const boundImages = new WeakSet();
const remoteCache = new Map();
const remoteInflight = new Map();
const remoteFailureAt = new Map();
const visualCache = new Map();

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
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

const array = (value) => {
  try {
    return value ? Array.from(value) : [];
  } catch {
    return [];
  }
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
  text(file.type).toLowerCase().startsWith("image/") ||
  IMAGE_RE.test(text(file.name));

const labelFor = (file = {}) => {
  if (imageFile(file)) return "IMG";

  const name = text(file.name).toLowerCase();
  const dot = name.lastIndexOf(".");

  if (dot > 0) {
    return name.slice(dot + 1).slice(0, 4).toUpperCase();
  }

  return text(file.type).includes("pdf")
    ? "PDF"
    : "DOC";
};

function viewRoot() {
  return browser()
    ? document.querySelector(VIEW)
    : null;
}

function objectUrl(file) {
  if (!browser() || !imageFile(file)) return "";

  try {
    return window.URL?.createObjectURL?.(file) || "";
  } catch {
    return "";
  }
}

function revoke(url = "") {
  if (!browser() || !String(url).startsWith("blob:")) return;

  try {
    window.URL?.revokeObjectURL?.(url);
  } catch {
    // noop
  }
}

function clearPending() {
  for (const item of pending.entries.values()) {
    revoke(item.url);
  }

  pending.entries.clear();
  pending.order = [];
}

function clearVisualCache() {
  for (const record of visualCache.values()) {
    const img = record?.img;

    if (img?.isConnected) continue;

    try {
      img?.removeAttribute?.("src");
    } catch {
      // noop
    }
  }

  visualCache.clear();
}

function clearRemote() {
  remoteEpoch += 1;
  remoteCache.clear();
  remoteInflight.clear();
  remoteFailureAt.clear();
  clearVisualCache();
}

function registerFiles(values) {
  const files = array(values).filter(fileLike);

  if (
    !files.length ||
    files.some((file) => Number(file.size || 0) > MAX_SIZE)
  ) {
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

  if (pending.order.length + incoming.length > MAX_FILES) {
    return false;
  }

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

  if (
    !Number.isInteger(pos) ||
    pos < 0 ||
    pos >= pending.order.length
  ) {
    return false;
  }

  const key = pending.order[pos];

  revoke(pending.entries.get(key)?.url);
  pending.entries.delete(key);
  pending.order.splice(pos, 1);

  return true;
}

/* =========================================================
   LOCAL PENDING THUMBNAILS
========================================================= */

function imageState(img, state) {
  const box = img?.closest?.(
    "[data-local-preview-frame='true'], " +
    "[data-modal-thumb-frame='true']"
  );

  if (!box) return false;

  box.dataset.previewState = state;
  box.dataset.thumbError =
    state === "error"
      ? "true"
      : "false";

  return true;
}

function localThumb(item, index) {
  const box = document.createElement("span");
  box.className = "incidencias-modal-pending-thumb";
  box.dataset.localPreviewFrame = "true";
  box.dataset.fileSignature = item.key;
  box.dataset.fileIndex = String(index);
  box.dataset.previewState =
    item.image && item.url
      ? "loading"
      : "fallback";

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

    img.addEventListener("load", () => {
      imageState(
        img,
        img.naturalWidth > 0 && img.naturalHeight > 0
          ? "ready"
          : "error"
      );
    });

    img.addEventListener("error", () => {
      imageState(img, "error");
    });

    box.appendChild(img);

    if (img.complete) {
      queueMicrotask(() => {
        if (!img.isConnected) return;

        imageState(
          img,
          img.naturalWidth > 0 && img.naturalHeight > 0
            ? "ready"
            : "error"
        );
      });
    }
  }

  return box;
}

function syncPending(root) {
  const rows = [
    ...root.querySelectorAll(
      ".incidencias-modal-pending-file[data-file-index]"
    ),
  ];

  if (!rows.length) {
    if (pending.order.length) clearPending();
    return;
  }

  for (const row of rows) {
    const index = Number(row.dataset.fileIndex ?? -1);
    const key =
      Number.isInteger(index)
        ? pending.order[index]
        : "";

    const item =
      key
        ? pending.entries.get(key)
        : null;

    const current =
      row.querySelector("[data-local-preview-frame='true']");

    if (!item) {
      current?.remove?.();
      row.dataset.mediaPreviewEnhanced = "false";
      continue;
    }

    row.dataset.mediaPreviewEnhanced = "true";

    if (current?.dataset.fileSignature === key) {
      continue;
    }

    current?.remove?.();
    row.insertBefore(
      localThumb(item, index),
      row.firstChild
    );
  }
}

function syncSlots(root) {
  const feedback =
    root.querySelector("[data-modal-feedback-slot='true']");

  if (feedback) {
    feedback.dataset.slotEmpty =
      feedback.querySelector(".incidencias-modal-feedback")
        ? "false"
        : "true";
  }

  const preview =
    root.querySelector("[data-modal-preview-slot='true']");

  if (preview) {
    preview.dataset.slotEmpty =
      preview.querySelector(".incidencias-modal-preview")
        ? "false"
        : "true";
  }
}

/* =========================================================
   REMOTE URL CACHE
========================================================= */

const remoteKey = (ticketId, attachmentId) =>
  text(ticketId) && text(attachmentId)
    ? `${text(ticketId)}::${text(attachmentId)}`
    : "";

function expiry(url) {
  try {
    const se =
      new URL(url, window.location.origin)
        .searchParams
        .get("se");

    const time = se
      ? Date.parse(se)
      : NaN;

    return Number.isFinite(time)
      ? time
      : Date.now() + DEFAULT_TTL;
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
  text(
    file.viewUrl ||
    file.openUrl ||
    file.signedUrl ||
    file.sasUrl ||
    file.url
  );

async function requestUrl(
  ticketId,
  attachmentId,
  force = false
) {
  const key = remoteKey(ticketId, attachmentId);

  if (!key) return "";

  if (!force) {
    const hit = cached(key);
    if (hit) return hit;
  }

  const failed = Number(remoteFailureAt.get(key) || 0);

  if (
    failed &&
    Date.now() - failed < FAILURE_COOLDOWN
  ) {
    return "";
  }

  if (remoteInflight.has(key)) {
    return remoteInflight.get(key);
  }

  const epoch = remoteEpoch;

  const task = (async () => {
    try {
      const file = await (await api()).openIncidenciaAttachment({
        ticketId,
        attachmentId,
      });

      const url = viewUrl(file);

      if (!url || epoch !== remoteEpoch) {
        return "";
      }

      remoteCache.set(key, {
        url,
        expiresAt: expiry(url),
      });

      remoteFailureAt.delete(key);
      return url;
    } catch {
      if (epoch === remoteEpoch) {
        remoteFailureAt.set(key, Date.now());
      }

      return "";
    } finally {
      if (epoch === remoteEpoch) {
        remoteInflight.delete(key);
      }
    }
  })();

  remoteInflight.set(key, task);
  return task;
}

/* =========================================================
   DECODED IMAGE CACHE
========================================================= */

function frameIdentity(frameNode = null) {
  const root = frameNode?.closest?.(ROOT);

  return {
    root,
    ticketId: text(root?.dataset?.ticketId, ""),
    attachmentId: text(frameNode?.dataset?.attachmentId, ""),
  };
}

function trimVisualCache() {
  if (visualCache.size <= MAX_VISUAL_CACHE) return false;

  const entries = [...visualCache.entries()]
    .sort(([, a], [, b]) =>
      Number(a?.touchedAt || 0) - Number(b?.touchedAt || 0)
    );

  for (const [key, record] of entries) {
    if (visualCache.size <= MAX_VISUAL_CACHE) break;

    if (record?.img?.isConnected) continue;

    try {
      record?.img?.removeAttribute?.("src");
    } catch {
      // noop
    }

    visualCache.delete(key);
  }

  return true;
}

function rememberVisual(frameNode, img, state = "") {
  if (!frameNode || !img) return null;

  const { ticketId, attachmentId } =
    frameIdentity(frameNode);

  const key = remoteKey(ticketId, attachmentId);

  if (!key) return null;

  const record =
    visualCache.get(key) || {
      key,
      ticketId,
      attachmentId,
      img,
      state: "loading",
      url: "",
      expiresAt: 0,
      touchedAt: 0,
    };

  record.img = img;
  record.state =
    state ||
    (
      img.complete &&
      img.naturalWidth > 0 &&
      img.naturalHeight > 0
        ? "ready"
        : record.state || "loading"
    );

  record.url = text(img.currentSrc || img.src, record.url);
  record.expiresAt =
    record.url
      ? expiry(record.url)
      : record.expiresAt;

  record.touchedAt = Date.now();

  visualCache.set(key, record);
  trimVisualCache();

  return record;
}

function cachedVisual(key = "") {
  const record = visualCache.get(key);

  if (!record?.img) return null;

  record.touchedAt = Date.now();

  /*
     Si la imagen ya fue decodificada, la mantenemos aunque la SAS haya
     caducado: esos píxeles ya están en memoria y no requieren red.
  */
  if (
    record.state !== "ready" &&
    Number(record.expiresAt || 0) <= Date.now() + EXPIRY_GUARD
  ) {
    visualCache.delete(key);
    return null;
  }

  return record;
}

function bindImage(img, remote = false) {
  if (!img || boundImages.has(img)) return false;

  boundImages.add(img);
  imageState(img, "loading");

  const loaded = () => {
    const state =
      img.naturalWidth > 0 &&
      img.naturalHeight > 0
        ? "ready"
        : "error";

    imageState(img, state);

    if (remote) {
      const frameNode =
        img.closest?.(REMOTE_FRAME);

      if (frameNode) {
        rememberVisual(frameNode, img, state);
      }
    }
  };

  const failed = () => {
    imageState(img, "error");

    if (remote) {
      const frameNode =
        img.closest?.(REMOTE_FRAME);

      if (frameNode) {
        rememberVisual(frameNode, img, "error");
      }

      void refreshRemoteImage(img);
    }
  };

  img.addEventListener("load", loaded);
  img.addEventListener("error", failed);

  if (img.complete) {
    queueMicrotask(() => {
      if (!img.isConnected) return;
      loaded();
    });
  }

  return true;
}

function attachCachedVisual(frameNode, record) {
  if (!frameNode?.isConnected || !record?.img) {
    return false;
  }

  const current =
    frameNode.querySelector(REMOTE_IMG);

  if (
    current === record.img &&
    record.img.isConnected
  ) {
    imageState(
      record.img,
      record.state || "ready"
    );

    return true;
  }

  if (record.img.isConnected) {
    /*
       Nunca robamos la imagen a otra tarjeta viva.
    */
    return false;
  }

  if (current && current !== record.img) {
    current.replaceWith(record.img);
  } else if (!current) {
    const fallback =
      frameNode.querySelector(
        ".incidencias-modal-image-thumb-fallback"
      );

    frameNode.insertBefore(
      record.img,
      fallback || frameNode.firstChild
    );
  }

  record.touchedAt = Date.now();

  imageState(
    record.img,
    record.state || "ready"
  );

  return true;
}

function fastRestoreCachedImages(root = null) {
  if (!root?.isConnected || !visualCache.size) return false;

  let restored = false;

  for (const frameNode of root.querySelectorAll(REMOTE_FRAME)) {
    const { ticketId, attachmentId } =
      frameIdentity(frameNode);

    const key = remoteKey(ticketId, attachmentId);
    const record = cachedVisual(key);

    if (
      record &&
      attachCachedVisual(frameNode, record)
    ) {
      restored = true;
    }
  }

  return restored;
}

function decorate(frameNode, img) {
  if (!frameNode || !img) return;

  const { ticketId, attachmentId } =
    frameIdentity(frameNode);

  const key = remoteKey(ticketId, attachmentId);
  const visualHit = cachedVisual(key);

  if (
    visualHit &&
    visualHit.img !== img &&
    !visualHit.img.isConnected
  ) {
    if (attachCachedVisual(frameNode, visualHit)) {
      return;
    }
  }

  if (boundImages.has(img)) {
    if (
      img.complete &&
      img.naturalWidth > 0 &&
      img.naturalHeight > 0
    ) {
      imageState(img, "ready");
      rememberVisual(frameNode, img, "ready");
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

  const name =
    text(
      button.getAttribute("aria-label"),
      "Imagen adjunta"
    )
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

  const root = button.closest(ROOT);
  const key = remoteKey(
    text(root?.dataset?.ticketId, ""),
    id
  );

  const visualHit = cachedVisual(key);

  const img =
    visualHit?.img && !visualHit.img.isConnected
      ? visualHit.img
      : document.createElement("img");

  img.className = "incidencias-modal-image-thumb";

  if (!visualHit) {
    img.src = url;
  }

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

  if (visualHit) {
    imageState(img, visualHit.state || "ready");
  } else {
    decorate(button, img);
  }

  return true;
}

async function hydrateFallback(button) {
  if (
    !button?.isConnected ||
    button.dataset.thumbnailHydrating === "true"
  ) {
    return;
  }

  if (
    text(
      button.querySelector(":scope > span")?.textContent
    ).toUpperCase() !== "IMG"
  ) {
    return;
  }

  const root = button.closest(ROOT);
  const ticketId = text(root?.dataset?.ticketId);
  const attachmentId = text(button.dataset.attachmentId);
  const key = remoteKey(ticketId, attachmentId);

  if (!key) return;

  const visualHit = cachedVisual(key);

  if (visualHit) {
    installRemoteThumb(
      button,
      visualHit.url || cached(key) || ""
    );

    return;
  }

  button.dataset.thumbnailHydrating = "true";

  const url = await requestUrl(
    ticketId,
    attachmentId
  );

  if (
    !button.isConnected ||
    text(root?.dataset?.ticketId) !== ticketId
  ) {
    return;
  }

  button.dataset.thumbnailHydrating = "false";

  if (!url) {
    button.dataset.previewState = "error";
    return;
  }

  installRemoteThumb(button, url);
}

async function refreshRemoteImage(img) {
  if (!img?.isConnected) return;

  const box =
    img.closest(REMOTE_FRAME);

  const root =
    img.closest(ROOT);

  const ticketId =
    text(root?.dataset?.ticketId);

  const attachmentId =
    text(box?.dataset?.attachmentId);

  const key =
    remoteKey(ticketId, attachmentId);

  if (
    !box ||
    !key ||
    box.dataset.thumbnailRefreshing === "true"
  ) {
    return;
  }

  box.dataset.thumbnailRefreshing = "true";
  remoteCache.delete(key);

  const url = await requestUrl(
    ticketId,
    attachmentId,
    true
  );

  box.dataset.thumbnailRefreshing = "false";

  if (!url || !img.isConnected) {
    imageState(img, "error");
    return;
  }

  box.dataset.previewState = "loading";
  img.src = url;

  const record =
    visualCache.get(key);

  if (record) {
    record.url = url;
    record.expiresAt = expiry(url);
    record.state = "loading";
    record.touchedAt = Date.now();
  }
}

function syncRemote(root) {
  fastRestoreCachedImages(root);

  for (const box of root.querySelectorAll(REMOTE_FRAME)) {
    const img =
      box.querySelector(REMOTE_IMG);

    if (img) {
      decorate(box, img);
    }
  }

  for (const button of root.querySelectorAll(REMOTE_FALLBACK)) {
    void hydrateFallback(button);
  }
}

/* =========================================================
   OBSERVERS / LIFECYCLE
========================================================= */

function syncModalObserver() {
  if (!browser()) return false;

  const nextHost =
    document.querySelector(MODAL_HOST);

  if (nextHost === observedModalHost) {
    return Boolean(nextHost);
  }

  modalObserver?.disconnect?.();
  modalObserver = null;
  observedModalHost = nextHost || null;

  if (
    observedModalHost &&
    typeof MutationObserver !== "undefined"
  ) {
    modalObserver = new MutationObserver(() => {
      const root =
        observedModalHost?.querySelector?.(ROOT) || null;

      /*
         MutationObserver corre antes del paint: reinyectar aquí el <img>
         decodificado evita el frame intermedio de placeholder.
      */
      if (root) {
        fastRestoreCachedImages(root);
      }

      schedule();
    });

    modalObserver.observe(
      observedModalHost,
      {
        childList: true,
        subtree: true,
      }
    );
  }

  return Boolean(observedModalHost);
}

function sync() {
  frame = 0;

  if (!browser() || !mounted) return;

  syncModalObserver();

  const root =
    observedModalHost?.querySelector?.(ROOT) || null;

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
  const input =
    event.target?.closest?.(INPUT);

  if (input) {
    registerFiles(input.files);
  }
}

function onDrop(event) {
  const zone =
    event.target?.closest?.(DROPZONE);

  if (zone) {
    registerFiles(event.dataTransfer?.files);
  }
}

function onClick(event) {
  const button =
    event.target?.closest?.(REMOVE);

  if (button) {
    removePending(
      Number(
        button.dataset.fileIndex ??
        button.dataset.removeAttachment ??
        -1
      )
    );
  }

  schedule();
}

export function mountIncidenciasMediaPreview() {
  if (!browser() || mounted) return false;

  const root = viewRoot();

  if (
    !root ||
    typeof MutationObserver === "undefined"
  ) {
    return false;
  }

  mounted = true;
  mountRoot = root;

  document.addEventListener("change", onChange, true);
  document.addEventListener("drop", onDrop, true);
  document.addEventListener("click", onClick, true);

  observer = new MutationObserver(() => {
    const modalRoot =
      document.querySelector(MODAL_HOST)
        ?.querySelector?.(ROOT) || null;

    if (modalRoot) {
      fastRestoreCachedImages(modalRoot);
    }

    schedule();
  });

  observer.observe(
    mountRoot,
    {
      childList: true,
      subtree: true,
    }
  );

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

  if (frame) {
    window.cancelAnimationFrame(frame);
  }

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
    decodedImageCacheEntries: visualCache.size,
    modalMounted: Boolean(lastRoot?.isConnected),

    policy: Object.freeze({
      canonicalViewEndpointOnly: true,
      signedUrlCache: true,
      signedUrlExpiryGuardMs: EXPIRY_GUARD,
      decodedImageLRU: true,
      reuseDecodedImageNodeAfterRerender: true,
      mutationMicrotaskRestore: true,
      unrelatedRefreshDoesNotInvalidateLoadedImage: true,
      privateBlobLocatorNotUsed: true,
    }),
  });
}

if (browser()) {
  mountIncidenciasMediaPreview();
}

export default Object.freeze({
  version: INCIDENCIAS_MEDIA_PREVIEW_VERSION,
  mount: mountIncidenciasMediaPreview,
  destroy: destroyIncidenciasMediaPreview,
  getSnapshot: getIncidenciasMediaPreviewSnapshot,
});

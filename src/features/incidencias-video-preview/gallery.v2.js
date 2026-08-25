/* =========================================================
   Onion Support · Incidencias Media Gallery
   Archivo: /src/features/incidencias-video-preview/gallery.js

   GALLERY NAVIGATION · V2 · SOLID BUFFERED
   - flechas y contador viven DENTRO del modal multimedia;
   - ArrowLeft/ArrowRight se capturan a nivel document mientras el visor existe;
   - nunca secuestra teclas de vídeo/audio/PDF/formularios;
   - conserva el visor canónico y delega la apertura al controller;
   - mantiene el frame anterior como buffer visual hasta que el nuevo media está listo;
   - evita parpadeos, fondos negros y saltos de tamaño durante navegación;
   - observer operativo limitado a la isla del modal y descubrimiento al Router view.
========================================================= */

export const INCIDENCIAS_MEDIA_GALLERY_VERSION =
  "incidencias-media-gallery.v2.solid-buffered-inner-controls";

const VIEW = "#view-container, [data-router-view='true']";
const HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const VIEWER = "[data-incidencias-media-viewer='true']";
const PREVIEW = ".incidencias-modal-preview[data-modal-preview='true']";
const ACTION_OPEN = "[data-detail-action='detail-attachment-open']";
const ATTACHMENT_ROW = ".incidencias-modal-attachment-row";
const ATTACHMENT_COPY = ".incidencias-modal-attachment-copy";
const NAV = "[data-media-gallery-action]";
const COUNTER = "[data-media-gallery-counter='true']";
const HOLD = "[data-media-gallery-hold='true']";

const MEDIA_EXT_RE =
  /\.(?:png|jpe?g|webp|gif|bmp|avif|heic|heif|pdf|mov|qt|mp4|m4v|webm|ogv|ogg)$/i;
const MEDIA_MIME_RE = /^(?:image\/|video\/|application\/pdf$)/i;

const NAVIGATION_TIMEOUT_MS = 5000;
const MEDIA_READY_TIMEOUT_MS = 1600;
const HOLD_RELEASE_MS = 110;

let mounted = false;
let modalHost = null;
let observer = null;
let viewObserver = null;
let mountRoot = null;
let frame = 0;

let navigationTimer = 0;
let navigationTargetId = "";
let navigationEpoch = 0;
let navigationSettling = false;
let lastPreviewId = "";
let navigationCount = 0;

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const text = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

function currentRoot() {
  return modalHost?.querySelector?.(ROOT) || null;
}

function currentViewer(root = currentRoot()) {
  return root?.querySelector?.(VIEWER) || null;
}

function currentPreview(viewer = currentViewer()) {
  return viewer?.querySelector?.(PREVIEW) || null;
}

function previewId(preview = currentPreview()) {
  return text(preview?.dataset?.previewAttachmentId, "");
}

function attachmentMeta(row = null, trigger = null) {
  const copy = row?.querySelector?.(ATTACHMENT_COPY);
  const name = text(
    copy?.querySelector?.("strong")?.textContent,
    text(trigger?.getAttribute?.("aria-label"), "")
      .replace(/^Ver\s+/i, "")
      .replace(/^Ampliar\s+/i, "")
  );
  const meta = text(copy?.querySelector?.("span")?.textContent, "");
  const mime = text(meta.split("·")[0], "").toLowerCase();
  return { name, mime };
}

function isGalleryMedia(row = null, trigger = null) {
  const { name, mime } = attachmentMeta(row, trigger);
  return Boolean(MEDIA_MIME_RE.test(mime) || MEDIA_EXT_RE.test(name));
}

function preferredTrigger(row = null) {
  if (!row) return null;
  const candidates = Array.from(row.querySelectorAll(ACTION_OPEN));
  if (!candidates.length) return null;

  return (
    candidates.find((node) => node.matches?.(".incidencias-modal-view-btn")) ||
    candidates.find((node) =>
      node.matches?.(
        ".incidencias-modal-image-thumb-wrap, .incidencias-modal-file-square"
      )
    ) ||
    candidates[0]
  );
}

function galleryItems(root = currentRoot()) {
  if (!root?.isConnected) return [];

  const seen = new Set();
  const items = [];

  for (const row of root.querySelectorAll(ATTACHMENT_ROW)) {
    const trigger = preferredTrigger(row);
    const id = text(trigger?.dataset?.attachmentId, "");

    if (!trigger || !id || seen.has(id) || !isGalleryMedia(row, trigger)) {
      continue;
    }

    seen.add(id);
    const { name, mime } = attachmentMeta(row, trigger);
    items.push({ id, name, mime, trigger, row });
  }

  return items;
}

function currentIndex(items = [], id = previewId()) {
  return items.findIndex((item) => item.id === id);
}

function clearHold(viewer = currentViewer(), { immediate = true } = {}) {
  const holds = Array.from(viewer?.querySelectorAll?.(HOLD) || []);

  for (const hold of holds) {
    if (!hold?.isConnected) continue;

    if (immediate) {
      hold.remove();
      continue;
    }

    hold.dataset.holdState = "releasing";
    window.setTimeout(() => {
      try { hold.remove(); } catch { /* noop */ }
    }, HOLD_RELEASE_MS);
  }

  return Boolean(holds.length);
}

function stripCloneSemantics(clone = null) {
  if (!clone) return false;

  clone.removeAttribute("id");
  clone.removeAttribute("data-modal-preview");
  clone.removeAttribute("data-preview-attachment-id");
  clone.removeAttribute("aria-labelledby");
  clone.removeAttribute("aria-describedby");
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("tabindex", "-1");
  clone.dataset.mediaGalleryHold = "true";
  clone.dataset.holdState = "holding";

  clone.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
  clone.querySelectorAll("[aria-live]").forEach((node) =>
    node.removeAttribute("aria-live")
  );
  clone
    .querySelectorAll(
      "[data-detail-action], [data-media-gallery-action], [data-media-gallery-counter]"
    )
    .forEach((node) => node.remove());

  clone
    .querySelectorAll("a, button, input, textarea, select, iframe, video, audio")
    .forEach((node) => {
      node.setAttribute("tabindex", "-1");
      node.setAttribute("aria-hidden", "true");
    });

  try { clone.inert = true; } catch { clone.setAttribute("inert", ""); }
  return true;
}

function freezeVideoFrames(source = null, clone = null) {
  if (!source || !clone) return false;

  const sourceVideos = Array.from(source.querySelectorAll("video"));
  const cloneVideos = Array.from(clone.querySelectorAll("video"));

  sourceVideos.forEach((video, index) => {
    const cloneVideo = cloneVideos[index];
    if (!cloneVideo) return;

    const width = Number(video.videoWidth || 0);
    const height = Number(video.videoHeight || 0);

    if (width <= 0 || height <= 0) {
      try {
        cloneVideo.pause?.();
        cloneVideo.removeAttribute("controls");
        cloneVideo.muted = true;
      } catch { /* noop */ }
      return;
    }

    try {
      const scale = Math.min(1, 1280 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      canvas.className =
        `${cloneVideo.className || ""} incidencias-media-gallery-video-freeze`.trim();
      canvas.setAttribute("aria-hidden", "true");

      const context = canvas.getContext("2d", {
        alpha: false,
        desynchronized: true,
      });

      context?.drawImage?.(video, 0, 0, canvas.width, canvas.height);
      cloneVideo.replaceWith(canvas);
    } catch {
      try {
        cloneVideo.pause?.();
        cloneVideo.removeAttribute("controls");
        cloneVideo.muted = true;
      } catch { /* noop */ }
    }
  });

  return Boolean(sourceVideos.length);
}

function createVisualHold(viewer = currentViewer(), preview = currentPreview(viewer)) {
  if (!viewer?.isConnected || !preview?.isConnected) return null;

  clearHold(viewer, { immediate: true });

  let clone;
  try { clone = preview.cloneNode(true); } catch { return null; }

  stripCloneSemantics(clone);
  freezeVideoFrames(preview, clone);
  clone.classList.add("incidencias-media-gallery-hold");

  const rect = preview.getBoundingClientRect();
  clone.style.position = "fixed";
  clone.style.inset = "auto";
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.inlineSize = `${rect.width}px`;
  clone.style.blockSize = `${rect.height}px`;
  clone.style.maxInlineSize = "none";
  clone.style.maxBlockSize = "none";
  clone.style.transform = "none";

  viewer.appendChild(clone);
  return clone;
}

function mediaReadyNow(preview = null) {
  if (!preview?.isConnected) return false;

  const image = preview.querySelector("img.incidencias-modal-preview-image, img");
  if (image) {
    return Boolean(image.complete && Number(image.naturalWidth || 0) > 0);
  }

  const video = preview.querySelector("video");
  if (video) {
    const mediaFrame = video.closest?.(".incidencias-modal-preview-frame");
    return Boolean(
      Number(video.readyState || 0) >= 2 ||
      mediaFrame?.dataset?.videoState === "ready" ||
      mediaFrame?.dataset?.videoState === "error"
    );
  }

  if (preview.dataset?.previewKind === "video") {
    return false;
  }

  const iframe = preview.querySelector("iframe");
  if (iframe) {
    return iframe.dataset.mediaGalleryLoaded === "true";
  }

  const preparing = preview.querySelector(
    ".incidencias-modal-video-preparing, .incidencias-modal-video-loader:not([hidden])"
  );

  return !preparing;
}

function waitForPreviewReady(
  preview = null,
  epoch = navigationEpoch,
  timeoutMs = MEDIA_READY_TIMEOUT_MS
) {
  return new Promise((resolve) => {
    if (!preview?.isConnected || epoch !== navigationEpoch) {
      resolve(false);
      return;
    }

    let settled = false;
    let timeout = 0;
    let mutationObserver = null;
    const cleanups = [];

    const cleanup = () => {
      if (timeout) {
        window.clearTimeout(timeout);
        timeout = 0;
      }
      mutationObserver?.disconnect?.();
      mutationObserver = null;
      while (cleanups.length) {
        try { cleanups.pop()?.(); } catch { /* noop */ }
      }
    };

    const finish = (ready = true) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Boolean(ready));
    };

    const check = () => {
      if (epoch !== navigationEpoch || !preview.isConnected) {
        finish(false);
        return;
      }
      if (mediaReadyNow(preview)) {
        window.requestAnimationFrame?.(() => finish(true));
      }
    };

    const bindMedia = () => {
      const image = preview.querySelector("img.incidencias-modal-preview-image, img");
      if (image && image.dataset.mediaGalleryReadyBound !== "true") {
        image.dataset.mediaGalleryReadyBound = "true";
        const onReady = () => finish(true);
        image.addEventListener("load", onReady, { once: true });
        image.addEventListener("error", onReady, { once: true });
        cleanups.push(() => {
          image.removeEventListener("load", onReady);
          image.removeEventListener("error", onReady);
        });
      }

      const video = preview.querySelector("video");
      if (video && video.dataset.mediaGalleryReadyBound !== "true") {
        video.dataset.mediaGalleryReadyBound = "true";
        const onReady = () => finish(true);
        for (const type of ["loadeddata", "canplay", "error"]) {
          video.addEventListener(type, onReady, { once: true });
        }
        cleanups.push(() => {
          for (const type of ["loadeddata", "canplay", "error"]) {
            video.removeEventListener(type, onReady);
          }
        });
      }

      const iframe = preview.querySelector("iframe");
      if (iframe && iframe.dataset.mediaGalleryReadyBound !== "true") {
        iframe.dataset.mediaGalleryReadyBound = "true";
        const onReady = () => {
          iframe.dataset.mediaGalleryLoaded = "true";
          finish(true);
        };
        iframe.addEventListener("load", onReady, { once: true });
        cleanups.push(() => iframe.removeEventListener("load", onReady));
      }

      check();
    };

    mutationObserver = new MutationObserver(bindMedia);
    mutationObserver.observe(preview, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "hidden", "data-video-state"],
    });

    timeout = window.setTimeout(() => finish(true), timeoutMs);
    bindMedia();
  });
}

function svgChevron(direction = "next") {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute(
    "d",
    direction === "previous" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"
  );

  svg.appendChild(path);
  return svg;
}

function createNavButton(direction = "next") {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    `incidencias-media-gallery-nav incidencias-media-gallery-nav--${direction}`;
  button.dataset.mediaGalleryAction = direction;
  button.setAttribute(
    "aria-label",
    direction === "previous"
      ? "Adjunto multimedia anterior"
      : "Adjunto multimedia siguiente"
  );
  button.appendChild(svgChevron(direction));
  return button;
}

function ensureControls(preview = currentPreview()) {
  if (!preview?.isConnected) return null;

  let previous = preview.querySelector(
    `${NAV}[data-media-gallery-action='previous']`
  );
  let next = preview.querySelector(`${NAV}[data-media-gallery-action='next']`);
  let counter = preview.querySelector(COUNTER);

  if (!previous) {
    previous = createNavButton("previous");
    preview.appendChild(previous);
  }
  if (!next) {
    next = createNavButton("next");
    preview.appendChild(next);
  }
  if (!counter) {
    counter = document.createElement("div");
    counter.className = "incidencias-media-gallery-counter";
    counter.dataset.mediaGalleryCounter = "true";
    counter.setAttribute("role", "status");
    counter.setAttribute("aria-live", "polite");
    counter.setAttribute("aria-atomic", "true");
    preview.appendChild(counter);
  }

  return { previous, next, counter };
}

function syncControls(
  root = currentRoot(),
  viewer = currentViewer(root),
  preview = currentPreview(viewer)
) {
  if (!root?.isConnected || !viewer?.isConnected || !preview?.isConnected) {
    return false;
  }

  const controls = ensureControls(preview);
  if (!controls) return false;

  const items = galleryItems(root);
  const id = previewId(preview);
  const index = currentIndex(items, id);
  const usable = items.length > 1 && index >= 0;
  const navigating = viewer.dataset.galleryNavigating === "true";

  controls.previous.hidden = !usable;
  controls.next.hidden = !usable;
  controls.counter.hidden = !usable;

  if (!usable) {
    controls.previous.disabled = true;
    controls.next.disabled = true;
    controls.counter.textContent = "";
    return true;
  }

  const previousItem = items[index - 1] || null;
  const nextItem = items[index + 1] || null;

  controls.previous.disabled = navigating || !previousItem;
  controls.next.disabled = navigating || !nextItem;
  controls.previous.setAttribute(
    "aria-label",
    previousItem?.name
      ? `Anterior: ${previousItem.name}`
      : "No hay adjunto multimedia anterior"
  );
  controls.next.setAttribute(
    "aria-label",
    nextItem?.name
      ? `Siguiente: ${nextItem.name}`
      : "No hay adjunto multimedia siguiente"
  );
  controls.previous.title = previousItem?.name || "";
  controls.next.title = nextItem?.name || "";
  controls.counter.textContent = `${index + 1} / ${items.length}`;
  return true;
}

function clearNavigationTimer() {
  if (!browser() || !navigationTimer) {
    navigationTimer = 0;
    return false;
  }
  window.clearTimeout(navigationTimer);
  navigationTimer = 0;
  return true;
}

function finishNavigation(viewer = currentViewer(), epoch = navigationEpoch) {
  if (epoch !== navigationEpoch) return false;

  clearNavigationTimer();
  navigationTargetId = "";
  navigationSettling = false;

  if (viewer?.isConnected) {
    viewer.dataset.galleryNavigating = "false";
    delete viewer.dataset.galleryTargetId;
  }
  return true;
}

function dispatchControllerOpen(trigger = null) {
  if (!trigger?.isConnected) return false;

  try {
    trigger.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
      })
    );
    return true;
  } catch {
    try {
      trigger.click?.();
      return true;
    } catch {
      return false;
    }
  }
}

async function settleNavigation(
  viewer = currentViewer(),
  preview = currentPreview(viewer),
  epoch = navigationEpoch
) {
  if (
    navigationSettling ||
    epoch !== navigationEpoch ||
    !viewer?.isConnected ||
    !preview?.isConnected
  ) {
    return false;
  }

  navigationSettling = true;

  try {
    await waitForPreviewReady(preview, epoch);

    if (
      epoch !== navigationEpoch ||
      !viewer.isConnected ||
      previewId(preview) !== navigationTargetId
    ) {
      return false;
    }

    preview.dataset.galleryReady = "true";
    clearHold(viewer, { immediate: false });
    finishNavigation(viewer, epoch);
    syncControls(currentRoot(), viewer, preview);
    return true;
  } finally {
    if (epoch === navigationEpoch) navigationSettling = false;
  }
}

function navigate(direction = "next") {
  const root = currentRoot();
  const viewer = currentViewer(root);
  const preview = currentPreview(viewer);

  if (
    !root?.isConnected ||
    !viewer?.isConnected ||
    !preview?.isConnected ||
    viewer.dataset.viewerState === "closing" ||
    viewer.dataset.galleryNavigating === "true"
  ) {
    return false;
  }

  const items = galleryItems(root);
  const index = currentIndex(items, previewId(preview));
  if (index < 0) return false;

  const delta = direction === "previous" ? -1 : 1;
  const target = items[index + delta] || null;
  if (!target?.trigger?.isConnected) return false;

  const epoch = ++navigationEpoch;
  navigationTargetId = target.id;
  navigationSettling = false;
  navigationCount += 1;

  createVisualHold(viewer, preview);
  viewer.dataset.galleryNavigating = "true";
  viewer.dataset.galleryTargetId = target.id;
  syncControls(root, viewer, preview);

  clearNavigationTimer();
  navigationTimer = window.setTimeout(() => {
    if (epoch !== navigationEpoch) return;
    clearHold(currentViewer(), { immediate: false });
    finishNavigation(currentViewer(), epoch);
    schedule();
  }, NAVIGATION_TIMEOUT_MS);

  if (!dispatchControllerOpen(target.trigger)) {
    clearHold(viewer, { immediate: false });
    finishNavigation(viewer, epoch);
    syncControls(root, viewer, preview);
    return false;
  }

  return true;
}

function interactiveMediaOwnsArrows(node = null) {
  if (!node || node === document.body || node === document.documentElement) {
    return false;
  }

  return Boolean(
    node.closest?.(
      "video, audio, iframe, input, textarea, select, [contenteditable='true']"
    )
  );
}

function onClick(event) {
  const button = event.target?.closest?.(NAV);
  if (!button?.closest?.(VIEWER)) return;

  event.preventDefault();
  event.stopPropagation();
  navigate(
    button.dataset.mediaGalleryAction === "previous" ? "previous" : "next"
  );
}

function onDocumentKeyDown(event) {
  if (
    !["ArrowLeft", "ArrowRight"].includes(event.key) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return;
  }

  const viewer = currentViewer();

  if (
    !viewer?.isConnected ||
    viewer.dataset.viewerState === "closing" ||
    interactiveMediaOwnsArrows(event.target) ||
    interactiveMediaOwnsArrows(document.activeElement)
  ) {
    return;
  }

  const direction = event.key === "ArrowLeft" ? "previous" : "next";

  if (navigate(direction)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function unbindHost(host = modalHost) {
  if (!host) return false;
  host.removeEventListener("click", onClick, true);
  return true;
}

function bindHost(host = modalHost) {
  if (!host) return false;
  host.addEventListener("click", onClick, true);
  return true;
}

function syncModalHost() {
  const nextHost = document.querySelector(HOST);
  if (nextHost === modalHost) return Boolean(nextHost);

  if (modalHost) unbindHost(modalHost);
  observer?.disconnect?.();
  observer = null;
  modalHost = nextHost || null;

  if (modalHost && typeof MutationObserver !== "undefined") {
    bindHost(modalHost);
    observer = new MutationObserver(schedule);
    observer.observe(modalHost, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-preview-active",
        "data-viewer-state",
        "data-preview-attachment-id",
        "data-video-state",
      ],
    });
  }

  return Boolean(modalHost);
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return false;

  syncModalHost();

  const root = currentRoot();
  const viewer = currentViewer(root);

  if (!root?.isConnected || !viewer?.isConnected) {
    lastPreviewId = "";
    navigationTargetId = "";
    navigationSettling = false;
    clearNavigationTimer();
    return false;
  }

  const preview = currentPreview(viewer);
  const id = previewId(preview);

  if (
    viewer.dataset.galleryNavigating === "true" &&
    navigationTargetId &&
    id === navigationTargetId &&
    preview?.isConnected
  ) {
    lastPreviewId = id;
    syncControls(root, viewer, preview);
    void settleNavigation(viewer, preview, navigationEpoch);
    return true;
  }

  if (id && id !== lastPreviewId) lastPreviewId = id;
  syncControls(root, viewer, preview);
  return true;
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

export function mountIncidenciasMediaGallery() {
  if (!browser() || mounted || typeof MutationObserver === "undefined") {
    return false;
  }

  mountRoot = document.querySelector(VIEW) || document.body;
  if (!mountRoot) return false;

  mounted = true;
  document.addEventListener("keydown", onDocumentKeyDown, true);

  viewObserver = new MutationObserver(schedule);
  viewObserver.observe(mountRoot, {
    childList: true,
    subtree: true,
  });

  syncModalHost();
  schedule();
  return true;
}

export function destroyIncidenciasMediaGallery() {
  if (!browser() || !mounted) return false;

  mounted = false;
  navigationEpoch += 1;
  document.removeEventListener("keydown", onDocumentKeyDown, true);

  if (modalHost) unbindHost(modalHost);
  clearHold(currentViewer(), { immediate: true });

  observer?.disconnect?.();
  viewObserver?.disconnect?.();
  observer = null;
  viewObserver = null;
  modalHost = null;
  mountRoot = null;

  if (frame) window.cancelAnimationFrame?.(frame);
  frame = 0;
  clearNavigationTimer();
  navigationTargetId = "";
  navigationSettling = false;
  lastPreviewId = "";
  return true;
}

export function getIncidenciasMediaGallerySnapshot() {
  const root = currentRoot();
  const viewer = currentViewer(root);
  const preview = currentPreview(viewer);
  const items = galleryItems(root);
  const id = previewId(preview);

  return Object.freeze({
    version: INCIDENCIAS_MEDIA_GALLERY_VERSION,
    mounted,
    viewerOpen: Boolean(viewer?.isConnected),
    galleryItems: items.length,
    currentIndex: Math.max(-1, currentIndex(items, id)),
    navigating: viewer?.dataset?.galleryNavigating === "true",
    bufferedFrame: Boolean(viewer?.querySelector?.(HOLD)),
    navigationCount,
    policy: Object.freeze({
      controllerOwnsAttachmentOpen: true,
      viewerLayerReused: true,
      noViewerCloseBetweenItems: true,
      noPolling: true,
      mediaOnly: true,
      controlsInsideMediaModal: true,
      arrowButtons: true,
      documentKeyboardArrowsWhileViewerOpen: true,
      nativeMediaKeysPreserved: true,
      previousFrameHeldUntilNewMediaReady: true,
      imageLoadAware: true,
      videoLoadedDataAware: true,
      pdfLoadAware: true,
      navigationFailOpenTimeout: true,
      scrollSessionDelegatedToCore: true,
      observerScope: "modal-island",
      hostDiscoveryScope: "stable-router-view",
    }),
  });
}

if (browser()) mountIncidenciasMediaGallery();

export default Object.freeze({
  version: INCIDENCIAS_MEDIA_GALLERY_VERSION,
  mount: mountIncidenciasMediaGallery,
  destroy: destroyIncidenciasMediaGallery,
  getSnapshot: getIncidenciasMediaGallerySnapshot,
});
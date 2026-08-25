/* =========================================================
   Onion Support · Incidencias Media Gallery
   Archivo: /src/features/incidencias-video-preview/gallery.js

   GALLERY NAVIGATION · V1
   - reutiliza el visor canónico ya abierto; nunca cierra/reabre la capa;
   - navega únicamente por adjuntos visualizables del ticket actual;
   - delega la apertura real al controller mediante su acción canónica;
   - conserva la sesión de scroll/foco gestionada por core.js;
   - flechas visuales + teclado ArrowLeft/ArrowRight cuando no interfieren con
     controles nativos de vídeo/PDF/formulario;
   - contador accesible y estado de transición sin polling;
   - observer limitado a la isla del modal.
========================================================= */

export const INCIDENCIAS_MEDIA_GALLERY_VERSION =
  "incidencias-media-gallery.v1.controller-bridged-carousel";

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

const MEDIA_EXT_RE =
  /\.(?:png|jpe?g|webp|gif|bmp|avif|heic|heif|pdf|mov|qt|mp4|m4v|webm|ogv|ogg)$/i;
const MEDIA_MIME_RE = /^(?:image\/|video\/|application\/pdf$)/i;
const NAVIGATION_TIMEOUT_MS = 3500;

let mounted = false;
let modalHost = null;
let observer = null;
let viewObserver = null;
let mountRoot = null;
let frame = 0;
let navigationTimer = 0;
let navigationTargetId = "";
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

  return Boolean(
    MEDIA_MIME_RE.test(mime) ||
    MEDIA_EXT_RE.test(name)
  );
}

function preferredTrigger(row = null) {
  if (!row) return null;

  const candidates = Array.from(row.querySelectorAll(ACTION_OPEN));
  if (!candidates.length) return null;

  return (
    candidates.find((node) =>
      node.matches?.(".incidencias-modal-view-btn")
    ) ||
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

function clearNavigationTimer() {
  if (!browser() || !navigationTimer) {
    navigationTimer = 0;
    return false;
  }

  window.clearTimeout(navigationTimer);
  navigationTimer = 0;
  return true;
}

function finishNavigation(viewer = currentViewer()) {
  clearNavigationTimer();
  navigationTargetId = "";

  if (viewer?.isConnected) {
    viewer.dataset.galleryNavigating = "false";
    delete viewer.dataset.galleryTargetId;
  }

  return true;
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
    direction === "previous"
      ? "m15 18-6-6 6-6"
      : "m9 18 6-6-6-6"
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

function ensureControls(viewer = currentViewer()) {
  if (!viewer?.isConnected) return null;

  let previous = viewer.querySelector(`${NAV}[data-media-gallery-action='previous']`);
  let next = viewer.querySelector(`${NAV}[data-media-gallery-action='next']`);
  let counter = viewer.querySelector(COUNTER);

  if (!previous) {
    previous = createNavButton("previous");
    viewer.appendChild(previous);
  }

  if (!next) {
    next = createNavButton("next");
    viewer.appendChild(next);
  }

  if (!counter) {
    counter = document.createElement("div");
    counter.className = "incidencias-media-gallery-counter";
    counter.dataset.mediaGalleryCounter = "true";
    counter.setAttribute("role", "status");
    counter.setAttribute("aria-live", "polite");
    counter.setAttribute("aria-atomic", "true");
    viewer.appendChild(counter);
  }

  return { previous, next, counter };
}

function syncControls(root = currentRoot(), viewer = currentViewer(root)) {
  if (!root?.isConnected || !viewer?.isConnected) return false;

  const controls = ensureControls(viewer);
  if (!controls) return false;

  const items = galleryItems(root);
  const id = previewId(currentPreview(viewer));
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

  navigationTargetId = target.id;
  navigationCount += 1;

  viewer.dataset.galleryNavigating = "true";
  viewer.dataset.galleryTargetId = target.id;
  syncControls(root, viewer);

  clearNavigationTimer();
  navigationTimer = window.setTimeout(() => {
    navigationTimer = 0;
    finishNavigation(currentViewer());
    schedule();
  }, NAVIGATION_TIMEOUT_MS);

  if (!dispatchControllerOpen(target.trigger)) {
    finishNavigation(viewer);
    syncControls(root, viewer);
    return false;
  }

  return true;
}

function interactiveMediaOwnsArrows(node = document.activeElement) {
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
    button.dataset.mediaGalleryAction === "previous"
      ? "previous"
      : "next"
  );
}

function onKeyDown(event) {
  if (
    !["ArrowLeft", "ArrowRight"].includes(event.key) ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    !currentViewer()?.isConnected ||
    interactiveMediaOwnsArrows()
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
  host.removeEventListener("keydown", onKeyDown, true);
  return true;
}

function bindHost(host = modalHost) {
  if (!host) return false;

  host.addEventListener("click", onClick, true);
  host.addEventListener("keydown", onKeyDown, true);
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
    clearNavigationTimer();
    return false;
  }

  const id = previewId(currentPreview(viewer));

  if (
    viewer.dataset.galleryNavigating === "true" &&
    navigationTargetId &&
    id === navigationTargetId
  ) {
    lastPreviewId = id;

    window.requestAnimationFrame?.(() => {
      if (!viewer.isConnected) return;
      finishNavigation(viewer);
      syncControls(root, viewer);
    });

    return true;
  }

  if (id && id !== lastPreviewId) {
    lastPreviewId = id;
  }

  syncControls(root, viewer);
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

  if (modalHost) unbindHost(modalHost);

  observer?.disconnect?.();
  viewObserver?.disconnect?.();
  observer = null;
  viewObserver = null;
  modalHost = null;
  mountRoot = null;

  if (frame) {
    window.cancelAnimationFrame?.(frame);
  }

  frame = 0;
  clearNavigationTimer();
  navigationTargetId = "";
  lastPreviewId = "";
  return true;
}

export function getIncidenciasMediaGallerySnapshot() {
  const root = currentRoot();
  const viewer = currentViewer(root);
  const items = galleryItems(root);
  const id = previewId(currentPreview(viewer));

  return Object.freeze({
    version: INCIDENCIAS_MEDIA_GALLERY_VERSION,
    mounted,
    viewerOpen: Boolean(viewer?.isConnected),
    galleryItems: items.length,
    currentIndex: Math.max(-1, currentIndex(items, id)),
    navigating: viewer?.dataset?.galleryNavigating === "true",
    navigationCount,
    policy: Object.freeze({
      controllerOwnsAttachmentOpen: true,
      viewerLayerReused: true,
      noViewerCloseBetweenItems: true,
      noPolling: true,
      mediaOnly: true,
      arrowButtons: true,
      keyboardArrows: true,
      nativeMediaKeysPreserved: true,
      scrollSessionDelegatedToCore: true,
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

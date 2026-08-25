/* =========================================================
   Onion Support · Incidencias Attachment Viewer
   Archivo: /src/features/incidencias-video-preview/index.js

   VIEWER / VIDEO UX · V4
   - visor modal independiente del flujo del ticket;
   - conserva el scroll exacto del body del Modal Details;
   - cancela cualquier desplazamiento automático inducido por la preview;
   - devuelve el foco al opener sin mover el ticket;
   - imagen/vídeo contenidos en viewport, PDF con scroll interno;
   - vídeo MOV/MP4/M4V/WebM por /view canónico;
   - primer fotograma real en el visor;
   - primer fotograma real también en "Documentos actuales", reutilizando el skin canónico de miniaturas;
   - fallback limpio cuando el navegador no decodifica el códec;
   - apertura/cierre simétricos, Escape/backdrop/focus-trap/inert;
   - sin monkey-patching de fetch, scrollIntoView ni APIs del navegador.

   El controller sigue siendo la autoridad de abrir/cerrar/descargar.
========================================================= */

export const INCIDENCIAS_VIDEO_PREVIEW_VERSION =
  "incidencias-video-preview.v4.scroll-anchor-video-thumbs";

const VIEW = "#view-container, [data-router-view='true']";
const HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const PANEL = "[data-incidencias-modal-panel='true']";
const BODY = "[data-modal-body='true']";
const SLOT = "[data-modal-preview-slot='true']";
const PREVIEW = ".incidencias-modal-preview[data-modal-preview='true']";
const PREVIEW_COPY = ".incidencias-modal-preview-copy";
const UNSUPPORTED_BOX = ".incidencias-modal-empty-box";
const VIEWER_STAGE = "[data-incidencias-media-viewer-stage='true']";
const ACTION_OPEN = "[data-detail-action='detail-attachment-open']";
const ACTION_CLOSE = "[data-detail-action='detail-preview-close']";

const ATTACHMENT_ROW = ".incidencias-modal-attachment-row";
const ATTACHMENT_COPY = ".incidencias-modal-attachment-copy";
const VIDEO_THUMB_CANDIDATE =
  ".incidencias-modal-file-square[data-renderable-thumbnail='false']";
const VIDEO_THUMB_FRAME = "[data-modal-video-thumb-frame='true']";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const VIDEO_EXT_RE = /\.(mov|qt|mp4|m4v|webm|ogv|ogg)$/i;
const VIDEO_MIME_RE = /(?:^|\s)(video\/[a-z0-9.+-]+)(?:\s|·|$)/i;
const VIDEO_LABEL_RE = /^(MOV|QT|MP4|M4V|WEBM|OGV|OGG)$/i;

const SAS_GUARD_MS = 30_000;
const DEFAULT_TTL_MS = 4 * 60_000;
const FIRST_FRAME_SECONDS = 0.08;
const CLOSE_TRANSITION_MS = 190;
const SCROLL_EPSILON = 0.5;

let mounted = false;
let mountRoot = null;
let viewObserver = null;
let modalObserver = null;
let modalHost = null;
let frame = 0;
let apiPromise = null;
let epoch = 0;

let activeViewer = null;
let pendingOpen = null;
let closeTimer = 0;
let controllerClosePass = false;
let correctingScroll = false;

const cache = new Map();
const inflight = new Map();
const thumbInflight = new Map();

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const text = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

const api = () =>
  apiPromise ||= import("../../views/incidencias/incidencias.api.js");

/* =========================================================
   BASICS / URL POLICY
========================================================= */

function ticketId(root = null) {
  return text(root?.dataset?.ticketId || root?.dataset?.incidenciaId, "");
}

function previewAttachmentId(preview = null) {
  return text(preview?.dataset?.previewAttachmentId, "");
}

function previewMeta(preview = null) {
  const copy = preview?.querySelector?.(PREVIEW_COPY);
  const name = text(copy?.querySelector?.("strong")?.textContent, "");
  const meta = text(copy?.querySelector?.("span")?.textContent, "");
  const mime = text(meta.match(VIDEO_MIME_RE)?.[1], "").toLowerCase();

  return { name, meta, mime };
}

function isVideoPreview(preview = null) {
  if (!preview) return false;
  if (preview.dataset.previewKind === "video") return true;

  const { name, meta, mime } = previewMeta(preview);

  return Boolean(
    mime.startsWith("video/") ||
    VIDEO_MIME_RE.test(meta) ||
    VIDEO_EXT_RE.test(name)
  );
}

function cacheKey(ticket = "", attachment = "") {
  const safeTicket = text(ticket, "");
  const safeAttachment = text(attachment, "");

  return safeTicket && safeAttachment
    ? `${safeTicket}::${safeAttachment}`
    : "";
}

function expiresAt(url = "") {
  try {
    const value = new URL(url, window.location.origin).searchParams.get("se");
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now() + DEFAULT_TTL_MS;
  } catch {
    return Date.now() + DEFAULT_TTL_MS;
  }
}

function cachedUrl(key = "") {
  const entry = cache.get(key);
  if (!entry?.url) return "";

  if (entry.expiresAt <= Date.now() + SAS_GUARD_MS) {
    cache.delete(key);
    return "";
  }

  return entry.url;
}

function viewUrl(file = {}) {
  return text(
    file?.viewUrl ||
    file?.openUrl ||
    file?.signedUrl ||
    file?.sasUrl ||
    file?.url,
    ""
  );
}

async function requestAttachmentUrl(
  ticket = "",
  attachment = "",
  { force = false } = {}
) {
  const key = cacheKey(ticket, attachment);
  if (!key) return "";

  if (!force) {
    const hit = cachedUrl(key);
    if (hit) return hit;
  }

  if (inflight.has(key)) return inflight.get(key);

  const localEpoch = epoch;

  const task = (async () => {
    try {
      const source = await api();
      const file = await source.openIncidenciaAttachment({
        ticketId: ticket,
        attachmentId: attachment,
      });

      if (localEpoch !== epoch) return "";

      const url = viewUrl(file);
      if (!url) return "";

      cache.set(key, {
        url,
        expiresAt: expiresAt(url),
      });

      return url;
    } catch {
      return "";
    } finally {
      if (inflight.get(key) === task) {
        inflight.delete(key);
      }
    }
  })();

  inflight.set(key, task);
  return task;
}

function requestPreviewUrl(root, preview, options = {}) {
  return requestAttachmentUrl(
    ticketId(root),
    previewAttachmentId(preview),
    options
  );
}

/* =========================================================
   VIEWER STATE / EXACT SCROLL ANCHOR
========================================================= */

function prefersReducedMotion() {
  if (!browser()) return true;

  try {
    return Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
    );
  } catch {
    return true;
  }
}

function visibleFocusables(root = null) {
  if (!root) return [];

  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((node) => {
    if (
      !node?.isConnected ||
      node.hidden ||
      node.getAttribute("aria-hidden") === "true"
    ) {
      return false;
    }

    try {
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden";
    } catch {
      return true;
    }
  });
}

function releaseScrollAnchorStyles(intent = pendingOpen) {
  const body = intent?.body;

  if (!body?.isConnected || intent?.stylesReleased) {
    return false;
  }

  intent.stylesReleased = true;

  if (intent.previousScrollBehavior) {
    body.style.scrollBehavior = intent.previousScrollBehavior;
  } else {
    body.style.removeProperty("scroll-behavior");
  }

  if (intent.previousOverflowAnchor) {
    body.style.overflowAnchor = intent.previousOverflowAnchor;
  } else {
    body.style.removeProperty("overflow-anchor");
  }

  body.dataset.mediaViewerScrollAnchor = "false";
  return true;
}

function restoreBodyScroll(intent = pendingOpen) {
  const body = intent?.body;

  if (
    !body?.isConnected ||
    intent?.userMoved
  ) {
    return false;
  }

  const target = Number(intent.scrollTop || 0);

  if (Math.abs(Number(body.scrollTop || 0) - target) <= SCROLL_EPSILON) {
    return true;
  }

  correctingScroll = true;

  try {
    body.scrollTop = target;
    body.scrollLeft = Number(intent.scrollLeft || 0);
  } catch {
    try {
      body.scrollTo?.({
        top: target,
        left: Number(intent.scrollLeft || 0),
        behavior: "auto",
      });
    } catch {
      // noop
    }
  } finally {
    queueMicrotask(() => {
      correctingScroll = false;
    });
  }

  return true;
}

function rememberOpenIntent(button = null) {
  const root = button?.closest?.(ROOT);
  if (!root) return false;

  const body = root.querySelector(BODY);
  if (!body) return false;

  if (pendingOpen) {
    releaseScrollAnchorStyles(pendingOpen);
  }

  pendingOpen = {
    ticketId: ticketId(root),
    attachmentId: text(button.dataset?.attachmentId, ""),
    opener: button,
    openerKind: button.matches?.(".incidencias-modal-view-btn")
      ? "action"
      : "thumbnail",
    body,
    scrollTop: Number(body.scrollTop || 0),
    scrollLeft: Number(body.scrollLeft || 0),
    userMoved: false,
    stylesReleased: false,
    previousScrollBehavior: body.style.scrollBehavior || "",
    previousOverflowAnchor: body.style.overflowAnchor || "",
  };

  /*
     Durante la apertura sólo anulamos desplazamientos que no vienen de un
     gesto real del usuario. El controller legacy todavía puede ejecutar
     scrollIntoView() sobre la preview inline; este ancla mantiene el scroll
     del ticket físicamente estable sin interceptar ni reemplazar esa API.
  */
  body.style.scrollBehavior = "auto";
  body.style.overflowAnchor = "none";
  body.dataset.mediaViewerScrollAnchor = "true";

  return true;
}

function resolveOpener(intent = pendingOpen, root = null) {
  if (intent?.opener?.isConnected) {
    return intent.opener;
  }

  const attachment = text(intent?.attachmentId, "");
  if (!attachment || !root?.isConnected) return null;

  const candidates = Array.from(
    root.querySelectorAll(ACTION_OPEN)
  ).filter((node) =>
    text(node?.dataset?.attachmentId, "") === attachment
  );

  if (!candidates.length) return null;

  if (intent?.openerKind === "action") {
    return (
      candidates.find((node) =>
        node.matches?.(".incidencias-modal-view-btn")
      ) || candidates[0]
    );
  }

  return (
    candidates.find((node) =>
      node.matches?.(
        ".incidencias-modal-file-square, " +
        ".incidencias-modal-image-thumb-wrap"
      )
    ) || candidates[0]
  );
}

function markUserMovement(event = null) {
  if (!pendingOpen || !pendingOpen.body?.isConnected) return;

  const target = event?.target;

  if (target && pendingOpen.body.contains?.(target)) {
    pendingOpen.userMoved = true;
    releaseScrollAnchorStyles(pendingOpen);
  }
}

function enforceScrollAnchor(event = null) {
  if (
    !pendingOpen ||
    pendingOpen.userMoved ||
    correctingScroll ||
    !pendingOpen.body?.isConnected
  ) {
    return;
  }

  if (event?.target !== pendingOpen.body) return;
  restoreBodyScroll(pendingOpen);
}

function stabilizeTicketScroll(root = null, preview = null) {
  const intent = pendingOpen;
  if (!intent) return false;

  const same =
    intent.ticketId === ticketId(root) &&
    (
      !intent.attachmentId ||
      intent.attachmentId === previewAttachmentId(preview)
    );

  if (!same) return false;

  restoreBodyScroll(intent);

  /*
     Dos frames: el primero absorbe el scroll iniciado en el mismo task por
     revealDetailPreview(); el segundo deja la posición final consolidada.
     No hay timer de polling ni lucha permanente con el usuario.
  */
  window.requestAnimationFrame?.(() => {
    restoreBodyScroll(intent);

    window.requestAnimationFrame?.(() => {
      restoreBodyScroll(intent);
      releaseScrollAnchorStyles(intent);
    });
  });

  return true;
}

function setPanelInert(root = null, inert = true) {
  const panel = root?.querySelector?.(PANEL);
  if (!panel) return false;

  if (inert) {
    if (!panel.dataset.viewerPreviousAriaHidden) {
      panel.dataset.viewerPreviousAriaHidden =
        panel.getAttribute("aria-hidden") ?? "__missing__";
    }

    panel.setAttribute("aria-hidden", "true");

    try {
      panel.inert = true;
    } catch {
      panel.setAttribute("inert", "");
    }

    panel.dataset.mediaViewerBackground = "true";
    return true;
  }

  const previous = panel.dataset.viewerPreviousAriaHidden;

  try {
    panel.inert = false;
  } catch {
    panel.removeAttribute("inert");
  }

  panel.removeAttribute("inert");
  panel.dataset.mediaViewerBackground = "false";

  if (previous === "__missing__" || !previous) {
    panel.removeAttribute("aria-hidden");
  } else {
    panel.setAttribute("aria-hidden", previous);
  }

  delete panel.dataset.viewerPreviousAriaHidden;
  return true;
}

function clearCloseTimer() {
  if (!browser() || !closeTimer) {
    closeTimer = 0;
    return false;
  }

  window.clearTimeout(closeTimer);
  closeTimer = 0;
  return true;
}

function createViewerLayer(root = null) {
  const layer = document.createElement("div");
  layer.className = "incidencias-media-viewer";
  layer.dataset.incidenciasMediaViewer = "true";
  layer.dataset.viewerState = "opening";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-label", "Visor de adjunto");

  const stage = document.createElement("div");
  stage.className = "incidencias-media-viewer-stage";
  stage.dataset.incidenciasMediaViewerStage = "true";

  layer.appendChild(stage);
  root.appendChild(layer);

  document.body?.classList.add("incidencias-media-viewer-open");

  return { layer, stage };
}

function activateViewerLayer(layer = null) {
  if (!layer?.isConnected) return false;

  const activate = () => {
    if (
      !layer.isConnected ||
      layer.dataset.viewerState === "closing"
    ) {
      return;
    }

    layer.dataset.viewerState = "ready";
  };

  if (prefersReducedMotion()) {
    activate();
    return true;
  }

  window.requestAnimationFrame?.(() => {
    window.requestAnimationFrame?.(activate);
  });

  return true;
}

function focusViewer() {
  const layer = activeViewer?.layer;
  const preview = activeViewer?.preview;

  if (!layer?.isConnected || !preview?.isConnected) return false;

  const close = preview.querySelector(ACTION_CLOSE);
  const target = close || visibleFocusables(layer)[0] || preview;

  if (target === preview && !preview.hasAttribute("tabindex")) {
    preview.setAttribute("tabindex", "-1");
  }

  queueMicrotask(() => {
    if (!target?.isConnected) return;

    try {
      target.focus({ preventScroll: true });
    } catch {
      try {
        target.focus();
      } catch {
        // noop
      }
    }
  });

  return true;
}

function cleanupViewer({ restoreFocus = true, preserveIntent = false } = {}) {
  clearCloseTimer();

  if (pendingOpen) {
    restoreBodyScroll(pendingOpen);
    if (!preserveIntent) {
      releaseScrollAnchorStyles(pendingOpen);
    }
  }

  if (!activeViewer) {
    if (!preserveIntent) pendingOpen = null;
    document.body?.classList.remove("incidencias-media-viewer-open");
    return false;
  }

  const { root, layer, opener } = activeViewer;

  setPanelInert(root, false);

  try {
    layer?.remove?.();
  } catch {
    // noop
  }

  activeViewer = null;
  document.body?.classList.remove("incidencias-media-viewer-open");

  const shouldRestore =
    restoreFocus &&
    root?.isConnected &&
    opener?.isConnected &&
    typeof opener.focus === "function";

  if (shouldRestore) {
    window.requestAnimationFrame?.(() => {
      try {
        opener.focus({ preventScroll: true });
      } catch {
        try {
          opener.focus();
        } catch {
          // noop
        }
      }
    });
  }

  if (!preserveIntent) pendingOpen = null;
  return true;
}

function pauseViewerMedia() {
  const preview = activeViewer?.preview;
  if (!preview) return false;

  preview.querySelectorAll?.("video, audio").forEach((media) => {
    try {
      media.pause?.();
    } catch {
      // noop
    }
  });

  return true;
}

function commitViewerClose() {
  clearCloseTimer();

  const viewer = activeViewer;
  const close = viewer?.preview?.querySelector?.(ACTION_CLOSE);

  if (!viewer?.layer?.isConnected || !close) {
    cleanupViewer({ restoreFocus: true });
    return false;
  }

  controllerClosePass = true;

  try {
    close.click();
    return true;
  } catch {
    cleanupViewer({ restoreFocus: true });
    return false;
  } finally {
    controllerClosePass = false;
  }
}

function requestViewerClose() {
  const layer = activeViewer?.layer;
  if (!layer?.isConnected) return false;

  if (layer.dataset.viewerState === "closing") return true;

  pauseViewerMedia();
  layer.dataset.viewerState = "closing";

  const delay = prefersReducedMotion() ? 0 : CLOSE_TRANSITION_MS;

  clearCloseTimer();

  closeTimer = window.setTimeout(() => {
    closeTimer = 0;
    commitViewerClose();
  }, delay);

  return true;
}

function adoptPreview(root = null, preview = null) {
  if (!root?.isConnected || !preview?.isConnected) return false;

  let layer = activeViewer?.root === root ? activeViewer.layer : null;
  let stage = activeViewer?.root === root ? activeViewer.stage : null;
  let createdLayer = false;

  if (!layer?.isConnected || !stage?.isConnected) {
    if (activeViewer) {
      cleanupViewer({
        restoreFocus: false,
        preserveIntent: true,
      });
    }

    ({ layer, stage } = createViewerLayer(root));
    createdLayer = true;
  }

  const previousPreview = activeViewer?.preview;
  const opener =
    resolveOpener(pendingOpen, root) ||
    activeViewer?.opener ||
    null;

  if (previousPreview && previousPreview !== preview) {
    try {
      previousPreview.remove();
    } catch {
      // noop
    }
  }

  if (isVideoPreview(preview)) {
    preview.dataset.previewKind = "video";
  }

  preview.classList.add("incidencias-modal-preview--viewer");
  preview.dataset.viewerOwned = "true";
  stage.replaceChildren(preview);

  activeViewer = { root, layer, stage, preview, opener };

  stabilizeTicketScroll(root, preview);
  setPanelInert(root, true);

  const title = preview.querySelector("#incidencias-modal-preview-title");

  if (title?.id) {
    layer.setAttribute("aria-labelledby", title.id);
    layer.removeAttribute("aria-label");
  }

  if (createdLayer) {
    activateViewerLayer(layer);
    focusViewer();
  } else if (layer.dataset.viewerState !== "closing") {
    layer.dataset.viewerState = "ready";
  }

  return true;
}

/* =========================================================
   VIDEO / FIRST FRAME IN VIEWER
========================================================= */

function videoFailureMessage(meta = {}) {
  const quickTime =
    meta.mime === "video/quicktime" ||
    /\.(mov|qt)$/i.test(meta.name);

  return quickTime
    ? "El archivo MOV está correcto, pero este navegador no puede decodificar su códec. Si el iPhone lo grabó en HEVC/H.265, los navegadores y equipos con soporte HEVC podrán reproducirlo; el original sigue disponible para descargar."
    : "El vídeo está disponible, pero este navegador no puede decodificar su códec. Puedes descargar el original desde la parte superior.";
}

function syncVideoIntrinsicSize(video = null) {
  if (!video) return false;

  const width = Number(video.videoWidth || 0);
  const height = Number(video.videoHeight || 0);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return false;
  }

  video.dataset.mediaWidth = String(width);
  video.dataset.mediaHeight = String(height);

  video.style.setProperty(
    "--incidencias-media-aspect",
    `${width} / ${height}`
  );

  return true;
}

function firstFrameTarget(video = null) {
  const duration = Number(video?.duration || 0);

  return Number.isFinite(duration) && duration > 0
    ? Math.min(
        FIRST_FRAME_SECONDS,
        Math.max(0.01, duration / 200)
      )
    : FIRST_FRAME_SECONDS;
}

function primeFirstFrame(
  video,
  {
    onReady = () => {},
  } = {}
) {
  let primed = false;

  const finish = () => {
    if (primed || !video?.isConnected) return;

    primed = true;
    syncVideoIntrinsicSize(video);

    try {
      video.pause();
    } catch {
      // noop
    }

    onReady();
  };

  const seek = () => {
    if (!video?.isConnected || primed) return;

    syncVideoIntrinsicSize(video);

    const target = firstFrameTarget(video);

    try {
      if (
        Math.abs(Number(video.currentTime || 0) - target) < 0.005
      ) {
        finish();
        return;
      }

      video.currentTime = target;
    } catch {
      finish();
    }
  };

  video.addEventListener(
    "loadedmetadata",
    () => {
      syncVideoIntrinsicSize(video);
      seek();
    },
    { once: true }
  );

  video.addEventListener("loadeddata", seek, { once: true });
  video.addEventListener("seeked", finish, { once: true });

  video.addEventListener(
    "canplay",
    () => {
      if (!primed && video.readyState >= 2) {
        if (Number(video.currentTime || 0) > 0) finish();
        else seek();
      }
    },
    { once: true }
  );

  if (video.readyState >= 1) queueMicrotask(seek);
}

function installViewerVideo(root, preview, url) {
  if (!url || !preview?.isConnected) return false;

  const meta = previewMeta(preview);
  const oldBox = preview.querySelector(UNSUPPORTED_BOX);

  const frameNode = document.createElement("div");
  frameNode.className = "incidencias-modal-preview-frame is-video";
  frameNode.dataset.modalPreviewVideoFrame = "true";
  frameNode.dataset.videoState = "loading";

  const video = document.createElement("video");
  video.className = "incidencias-modal-preview-video";
  video.controls = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  video.setAttribute("data-modal-preview-video", "true");
  video.setAttribute("aria-label", meta.name || "Vídeo adjunto");

  const loader = document.createElement("div");
  loader.className = "incidencias-modal-video-loader";
  loader.setAttribute("aria-hidden", "true");

  const spinner = document.createElement("span");
  const loaderText = document.createElement("strong");
  loaderText.textContent = "Preparando primer fotograma…";
  loader.append(spinner, loaderText);

  const fallback = document.createElement("div");
  fallback.className = "incidencias-modal-video-fallback";
  fallback.hidden = true;
  fallback.setAttribute("role", "status");

  let retried = false;

  const ready = () => {
    if (!frameNode.isConnected) return;

    frameNode.dataset.videoState = "ready";
    loader.hidden = true;
    fallback.hidden = true;
  };

  const fail = async () => {
    if (!video.isConnected) return;

    const unsupportedCodec = Number(video.error?.code || 0) === 4;

    if (!retried && !unsupportedCodec) {
      retried = true;

      const key = cacheKey(
        ticketId(root),
        previewAttachmentId(preview)
      );

      cache.delete(key);

      const freshUrl = await requestPreviewUrl(root, preview, {
        force: true,
      });

      if (
        freshUrl &&
        activeViewer?.preview === preview &&
        preview.isConnected
      ) {
        frameNode.dataset.videoState = "loading";
        loader.hidden = false;
        fallback.hidden = true;
        video.src = freshUrl;

        try {
          video.load();
        } catch {
          // noop
        }

        return;
      }
    }

    frameNode.dataset.videoState = "error";
    loader.hidden = true;
    fallback.textContent = videoFailureMessage(meta);
    fallback.hidden = false;
  };

  video.addEventListener("error", () => void fail());

  primeFirstFrame(video, { onReady: ready });
  frameNode.append(video, loader, fallback);

  if (oldBox) oldBox.replaceWith(frameNode);
  else preview.appendChild(frameNode);

  preview.dataset.previewKind = "video";
  preview.dataset.videoEnhanced = "true";
  preview.dataset.videoHydrating = "false";

  try {
    video.load();
  } catch {
    // error event handles fallback
  }

  return true;
}

async function upgradeViewerVideo(root, preview) {
  if (
    !root?.isConnected ||
    !preview?.isConnected ||
    preview.dataset.videoEnhanced === "true" ||
    preview.dataset.videoHydrating === "true" ||
    !isVideoPreview(preview)
  ) {
    return false;
  }

  const expectedKey = cacheKey(
    ticketId(root),
    previewAttachmentId(preview)
  );

  if (!expectedKey) return false;

  preview.dataset.previewKind = "video";
  preview.dataset.videoHydrating = "true";

  const oldBox = preview.querySelector(UNSUPPORTED_BOX);

  if (oldBox) {
    oldBox.classList.add("incidencias-modal-video-preparing");
    oldBox.setAttribute("role", "status");
    oldBox.setAttribute("aria-live", "polite");
    oldBox.textContent = "Preparando vista previa del vídeo…";
  }

  const url = await requestPreviewUrl(root, preview);

  if (
    !preview.isConnected ||
    activeViewer?.preview !== preview ||
    cacheKey(ticketId(root), previewAttachmentId(preview)) !== expectedKey
  ) {
    return false;
  }

  if (!url) {
    preview.dataset.videoHydrating = "false";

    if (oldBox?.isConnected) {
      oldBox.classList.remove("incidencias-modal-video-preparing");
      oldBox.textContent =
        "No se ha podido preparar el vídeo. El original sigue disponible para descargar.";
    }

    return false;
  }

  return installViewerVideo(root, preview, url);
}

/* =========================================================
   VIDEO THUMBNAILS · DOCUMENTOS ACTUALES
========================================================= */

function attachmentCardMeta(button = null) {
  const row = button?.closest?.(ATTACHMENT_ROW);
  const copy = row?.querySelector?.(ATTACHMENT_COPY);

  const name = text(
    copy?.querySelector?.("strong")?.textContent,
    text(button?.getAttribute?.("aria-label"), "")
      .replace(/^Ver\s+/i, "")
      .replace(/^Ampliar\s+/i, "")
  );

  const meta = text(copy?.querySelector?.("span")?.textContent, "");
  const mime = text(meta.match(VIDEO_MIME_RE)?.[1], "").toLowerCase();

  const fallbackLabel = text(
    button?.querySelector?.(":scope > span")?.textContent,
    ""
  ).toUpperCase();

  return {
    row,
    name,
    meta,
    mime,
    fallbackLabel,
  };
}

function isVideoThumbCandidate(button = null) {
  if (!button?.isConnected) return false;
  if (button.matches?.(VIDEO_THUMB_FRAME)) return true;

  const { name, meta, mime, fallbackLabel } =
    attachmentCardMeta(button);

  return Boolean(
    mime.startsWith("video/") ||
    VIDEO_MIME_RE.test(meta) ||
    VIDEO_EXT_RE.test(name) ||
    VIDEO_LABEL_RE.test(fallbackLabel)
  );
}

function markThumbState(button = null, state = "fallback") {
  if (!button?.isConnected) return false;

  button.dataset.previewState = state;
  button.dataset.thumbError = state === "error" ? "true" : "false";
  return true;
}

function installVideoThumbnail(button, url) {
  if (!button?.isConnected || !url) return false;

  const { name, fallbackLabel } = attachmentCardMeta(button);

  button.classList.remove("incidencias-modal-file-square");
  button.classList.add("incidencias-modal-image-thumb-wrap");

  Object.assign(button.dataset, {
    renderableThumbnail: "true",
    modalThumbFrame: "true",
    modalVideoThumbFrame: "true",
    previewState: "loading",
    thumbError: "false",
  });

  const video = document.createElement("video");
  video.className = "incidencias-modal-image-thumb incidencias-modal-video-thumb";
  video.src = url;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.controls = false;
  video.tabIndex = -1;
  video.setAttribute("aria-hidden", "true");
  video.setAttribute("data-modal-video-thumb-video", "true");
  video.setAttribute("draggable", "false");

  const fallback = document.createElement("span");
  fallback.className = "incidencias-modal-image-thumb-fallback";
  fallback.textContent =
    fallbackLabel ||
    text(name.split(".").pop(), "VID").slice(0, 4).toUpperCase() ||
    "VID";
  fallback.setAttribute("aria-hidden", "true");

  const badge = document.createElement("span");
  badge.className = "incidencias-modal-image-open-badge";
  badge.textContent = "▶ Ver";

  let retried = false;

  const ready = () => {
    markThumbState(button, "ready");
  };

  const fail = async () => {
    if (!button.isConnected) return;

    const unsupportedCodec = Number(video.error?.code || 0) === 4;

    if (!retried && !unsupportedCodec) {
      retried = true;

      const root = button.closest(ROOT);
      const ticket = ticketId(root);
      const attachment = text(button.dataset.attachmentId, "");
      const key = cacheKey(ticket, attachment);

      cache.delete(key);

      const freshUrl = await requestAttachmentUrl(
        ticket,
        attachment,
        { force: true }
      );

      if (freshUrl && button.isConnected) {
        markThumbState(button, "loading");
        video.src = freshUrl;

        try {
          video.load();
        } catch {
          // noop
        }

        return;
      }
    }

    markThumbState(button, "error");
  };

  video.addEventListener("error", () => void fail());

  primeFirstFrame(video, {
    onReady: ready,
  });

  button.replaceChildren(video, fallback, badge);

  try {
    video.load();
  } catch {
    markThumbState(button, "error");
  }

  return true;
}

async function hydrateVideoThumbnail(button = null) {
  if (
    !button?.isConnected ||
    button.dataset.videoThumbHydrating === "true" ||
    button.dataset.modalVideoThumbFrame === "true" ||
    !isVideoThumbCandidate(button)
  ) {
    return false;
  }

  const root = button.closest(ROOT);
  const ticket = ticketId(root);
  const attachment = text(button.dataset.attachmentId, "");
  const key = cacheKey(ticket, attachment);

  if (!key) return false;

  if (thumbInflight.has(key)) {
    await thumbInflight.get(key);
    return true;
  }

  button.dataset.videoThumbHydrating = "true";
  button.dataset.previewState = "loading";

  const task = (async () => {
    const url = await requestAttachmentUrl(ticket, attachment);

    if (
      !button.isConnected ||
      ticketId(root) !== ticket
    ) {
      return false;
    }

    button.dataset.videoThumbHydrating = "false";

    if (!url) {
      markThumbState(button, "error");
      return false;
    }

    return installVideoThumbnail(button, url);
  })();

  thumbInflight.set(key, task);

  try {
    return await task;
  } finally {
    if (thumbInflight.get(key) === task) {
      thumbInflight.delete(key);
    }
  }
}

function syncVideoThumbnails(root = null) {
  if (!root?.isConnected) return false;

  for (
    const button
    of root.querySelectorAll(VIDEO_THUMB_CANDIDATE)
  ) {
    if (isVideoThumbCandidate(button)) {
      void hydrateVideoThumbnail(button);
    }
  }

  return true;
}

/* =========================================================
   INPUT / FOCUS
========================================================= */

function trapViewerFocus(event = null) {
  if (!activeViewer?.layer?.isConnected) return false;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    requestViewerClose();
    return true;
  }

  if (event.key !== "Tab") return false;

  const focusables = visibleFocusables(activeViewer.layer);

  if (!focusables.length) {
    event.preventDefault();
    event.stopPropagation();
    focusViewer();
    return true;
  }

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (!activeViewer.layer.contains(active)) {
    event.preventDefault();
    event.stopPropagation();
    (event.shiftKey ? last : first).focus?.();
    return true;
  }

  if (event.shiftKey && active === first) {
    event.preventDefault();
    event.stopPropagation();
    last.focus?.();
    return true;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    event.stopPropagation();
    first.focus?.();
    return true;
  }

  event.stopPropagation();
  return false;
}

function onClickCapture(event) {
  const close = event.target?.closest?.(ACTION_CLOSE);

  if (
    close &&
    activeViewer?.preview?.contains?.(close) &&
    !controllerClosePass
  ) {
    event.preventDefault();
    event.stopPropagation();
    requestViewerClose();
    return;
  }

  const open = event.target?.closest?.(ACTION_OPEN);

  if (open?.closest?.(ROOT)) {
    rememberOpenIntent(open);
    return;
  }

  if (
    activeViewer?.layer &&
    (
      event.target === activeViewer.layer ||
      event.target?.matches?.(VIEWER_STAGE)
    )
  ) {
    event.preventDefault();
    event.stopPropagation();
    requestViewerClose();
  }
}

/* =========================================================
   DOM SYNC
========================================================= */

function syncModalObserver() {
  if (!browser()) return false;

  const nextHost = document.querySelector(HOST);

  if (nextHost === modalHost) {
    return Boolean(nextHost);
  }

  modalObserver?.disconnect?.();
  modalObserver = null;
  modalHost = nextHost || null;

  if (modalHost && typeof MutationObserver !== "undefined") {
    modalObserver = new MutationObserver(schedule);

    modalObserver.observe(modalHost, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-preview-active",
        "data-renderable-thumbnail",
      ],
    });
  }

  return Boolean(modalHost);
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return;

  syncModalObserver();

  const root = modalHost?.querySelector?.(ROOT) || null;

  if (!root) {
    cleanupViewer({ restoreFocus: false });
    return;
  }

  syncVideoThumbnails(root);

  const slot = root.querySelector(SLOT);
  const preview = slot?.querySelector?.(PREVIEW) || null;
  const active = slot?.dataset?.previewActive === "true";

  if (preview) {
    adoptPreview(root, preview);

    if (isVideoPreview(preview)) {
      void upgradeViewerVideo(root, preview);
    }

    return;
  }

  if (
    activeViewer?.root === root &&
    activeViewer.preview?.isConnected
  ) {
    if (active) {
      if (isVideoPreview(activeViewer.preview)) {
        void upgradeViewerVideo(root, activeViewer.preview);
      }

      return;
    }

    cleanupViewer({ restoreFocus: true });
    return;
  }

  if (!active) {
    cleanupViewer({ restoreFocus: true });
  }
}

function schedule() {
  if (!browser() || !mounted || frame) return false;

  frame = window.requestAnimationFrame(sync);
  return true;
}

/* =========================================================
   LIFECYCLE
========================================================= */

export function mountIncidenciasVideoPreview() {
  if (!browser() || mounted) return false;

  mountRoot = document.querySelector(VIEW) || document.body;

  if (!mountRoot || typeof MutationObserver === "undefined") {
    return false;
  }

  mounted = true;

  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("keydown", trapViewerFocus, true);
  document.addEventListener("scroll", enforceScrollAnchor, true);

  document.addEventListener("wheel", markUserMovement, {
    capture: true,
    passive: true,
  });

  document.addEventListener("touchmove", markUserMovement, {
    capture: true,
    passive: true,
  });

  viewObserver = new MutationObserver(schedule);

  viewObserver.observe(mountRoot, {
    childList: true,
    subtree: true,
  });

  schedule();
  return true;
}

export function destroyIncidenciasVideoPreview() {
  if (!browser()) return false;

  mounted = false;
  epoch += 1;

  document.removeEventListener("click", onClickCapture, true);
  document.removeEventListener("keydown", trapViewerFocus, true);
  document.removeEventListener("scroll", enforceScrollAnchor, true);
  document.removeEventListener("wheel", markUserMovement, true);
  document.removeEventListener("touchmove", markUserMovement, true);

  viewObserver?.disconnect?.();
  modalObserver?.disconnect?.();

  viewObserver = null;
  modalObserver = null;
  modalHost = null;

  if (frame) {
    window.cancelAnimationFrame?.(frame);
  }

  frame = 0;
  clearCloseTimer();
  cleanupViewer({ restoreFocus: false });

  cache.clear();
  inflight.clear();
  thumbInflight.clear();

  pendingOpen = null;
  mountRoot = null;

  return true;
}

export function getIncidenciasVideoPreviewSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_VIDEO_PREVIEW_VERSION,
    mounted,
    viewerOpen: Boolean(activeViewer?.layer?.isConnected),
    viewerState: text(
      activeViewer?.layer?.dataset?.viewerState,
      "closed"
    ),
    modalMounted: Boolean(modalHost?.isConnected),
    cacheEntries: cache.size,
    inflight: inflight.size,
    thumbnailInflight: thumbInflight.size,

    policy: Object.freeze({
      controllerOwnsOpenClose: true,
      canonicalViewEndpointOnly: true,
      privateBlobLocatorRejectedByApi: true,

      separateFullscreenViewer: true,
      mediaFitsViewport: true,
      outerMediaScrollDisabled: true,

      exactTicketScrollAnchor: true,
      automaticPreviewScrollNeutralized: true,
      userScrollStillAuthoritative: true,

      backgroundPanelInert: true,
      viewerFocusTrap: true,
      escapeClosesViewer: true,
      backdropClosesViewer: true,
      openerFocusRestored: true,
      symmetricOpenCloseMotion: true,

      nativeVideo: true,
      iphoneMov: true,
      viewerFirstFramePrime: true,
      currentFilesVideoFirstFrame: true,
      intrinsicVideoRatio: true,
      codecFallback: true,
      sasExpiryRetry: true,

      noScrollApiMonkeyPatch: true,
      noFetchMonkeyPatch: true,
    }),
  });
}

if (browser()) mountIncidenciasVideoPreview();

export default Object.freeze({
  version: INCIDENCIAS_VIDEO_PREVIEW_VERSION,
  mount: mountIncidenciasVideoPreview,
  destroy: destroyIncidenciasVideoPreview,
  getSnapshot: getIncidenciasVideoPreviewSnapshot,
});
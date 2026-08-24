/* =========================================================
   Onion Support · Incidencias Video Preview
   Archivo: /src/features/incidencias-video-preview/index.js

   Mejora progresiva de vídeo para el Modal Details:
   - convierte adjuntos de vídeo (incluido iPhone .mov/video/quicktime)
     en una vista <video> nativa usando exclusivamente el /view canónico;
   - mantiene Descargar/Cerrar del template como fallback;
   - no toca permisos, payloads ni locators privados de Blob;
   - no expone SAS fuera del atributo src necesario para reproducción;
   - reintenta una SAS caducada y degrada con un mensaje útil si el navegador
     no soporta el códec del archivo.
========================================================= */

export const INCIDENCIAS_VIDEO_PREVIEW_VERSION =
  "incidencias-video-preview.v1.iphone-mov-native";

const VIEW = "#view-container, [data-router-view='true']";
const HOST = "[data-incidencias-modal-host='true']";
const ROOT = "[data-incidencias-modal-root='true']";
const PREVIEW = ".incidencias-modal-preview[data-modal-preview='true']";
const PREVIEW_COPY = ".incidencias-modal-preview-copy";
const UNSUPPORTED_BOX = ".incidencias-modal-empty-box";

const VIDEO_EXT_RE = /\.(mov|qt|mp4|m4v|webm|ogv|ogg)$/i;
const VIDEO_MIME_RE = /(?:^|\s)(video\/[a-z0-9.+-]+)(?:\s|·|$)/i;
const SAS_GUARD_MS = 30_000;
const DEFAULT_TTL_MS = 4 * 60_000;

let mounted = false;
let mountRoot = null;
let viewObserver = null;
let modalObserver = null;
let modalHost = null;
let frame = 0;
let apiPromise = null;
let epoch = 0;

const cache = new Map();
const inflight = new Map();

const browser = () =>
  typeof window !== "undefined" && typeof document !== "undefined";

const text = (value = "", fallback = "") =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;

const api = () =>
  apiPromise ||= import("../../views/incidencias/incidencias.api.js");

function ticketId(root = null) {
  return text(root?.dataset?.ticketId || root?.dataset?.incidenciaId, "");
}

function attachmentId(preview = null) {
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

function keyFor(root = null, preview = null) {
  const ticket = ticketId(root);
  const attachment = attachmentId(preview);
  return ticket && attachment ? `${ticket}::${attachment}` : "";
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

async function requestViewUrl(root, preview, { force = false } = {}) {
  const key = keyFor(root, preview);
  if (!key) return "";

  if (!force) {
    const hit = cachedUrl(key);
    if (hit) return hit;
  }

  if (inflight.has(key)) return inflight.get(key);

  const localEpoch = epoch;
  const expectedTicket = ticketId(root);
  const expectedAttachment = attachmentId(preview);

  const task = (async () => {
    try {
      const source = await api();
      const file = await source.openIncidenciaAttachment({
        ticketId: expectedTicket,
        attachmentId: expectedAttachment,
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
      if (inflight.get(key) === task) inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

function currentPreviewStillMatches(root, preview, expectedKey) {
  if (!root?.isConnected || !preview?.isConnected) return false;
  if (keyFor(root, preview) !== expectedKey) return false;
  return root.querySelector(PREVIEW) === preview;
}

function setBusy(preview, busy = true) {
  if (!preview) return;
  preview.dataset.videoHydrating = busy ? "true" : "false";

  const box = preview.querySelector(UNSUPPORTED_BOX);
  if (box && busy) {
    box.classList.add("incidencias-modal-video-preparing");
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    box.textContent = "Preparando vista previa del vídeo…";
  }
}

function failureMessage(meta = {}) {
  const quickTime =
    meta.mime === "video/quicktime" || /\.mov$/i.test(meta.name);

  return quickTime
    ? "El vídeo está disponible, pero este navegador no puede reproducir el códec de este MOV. Puedes descargar el original; en navegadores con soporte HEVC/H.264 se reproducirá aquí directamente."
    : "El vídeo está disponible, pero este navegador no puede reproducir su códec. Puedes descargar el original desde la parte superior.";
}

function installVideo(root, preview, url) {
  if (!url || !preview?.isConnected) return false;

  const meta = previewMeta(preview);
  const oldBox = preview.querySelector(UNSUPPORTED_BOX);
  const frame = document.createElement("div");
  frame.className = "incidencias-modal-preview-frame is-video";
  frame.dataset.modalPreviewVideoFrame = "true";
  frame.dataset.videoState = "loading";

  const video = document.createElement("video");
  video.className = "incidencias-modal-preview-video";
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  video.setAttribute("data-modal-preview-video", "true");
  video.setAttribute("aria-label", meta.name || "Vídeo adjunto");

  const loader = document.createElement("div");
  loader.className = "incidencias-modal-video-loader";
  loader.setAttribute("aria-hidden", "true");
  loader.innerHTML = "<span></span><strong>Preparando vídeo…</strong>";

  const fallback = document.createElement("div");
  fallback.className = "incidencias-modal-video-fallback";
  fallback.hidden = true;
  fallback.setAttribute("role", "status");

  const ready = () => {
    if (!video.isConnected) return;
    frame.dataset.videoState = "ready";
    loader.hidden = true;
    fallback.hidden = true;
  };

  let retried = false;

  const fail = async () => {
    if (!video.isConnected) return;

    /* Una SAS puede caducar mientras el modal permanece abierto. */
    if (!retried) {
      retried = true;
      const key = keyFor(root, preview);
      cache.delete(key);
      const freshUrl = await requestViewUrl(root, preview, { force: true });

      if (
        freshUrl &&
        currentPreviewStillMatches(root, preview, key)
      ) {
        frame.dataset.videoState = "loading";
        loader.hidden = false;
        video.src = freshUrl;
        video.load();
        return;
      }
    }

    frame.dataset.videoState = "error";
    loader.hidden = true;
    fallback.textContent = failureMessage(meta);
    fallback.hidden = false;
  };

  video.addEventListener("loadedmetadata", ready, { once: true });
  video.addEventListener("canplay", ready, { once: true });
  video.addEventListener("error", () => void fail());

  frame.append(video, loader, fallback);

  if (oldBox) {
    oldBox.replaceWith(frame);
  } else {
    preview.appendChild(frame);
  }

  preview.dataset.previewKind = "video";
  preview.dataset.videoEnhanced = "true";
  preview.dataset.videoHydrating = "false";

  try {
    video.load();
  } catch {
    // El evento error/fallback conserva una salida segura.
  }

  return true;
}

async function upgrade(root, preview) {
  if (
    !root?.isConnected ||
    !preview?.isConnected ||
    preview.dataset.videoEnhanced === "true" ||
    preview.dataset.videoHydrating === "true" ||
    !isVideoPreview(preview)
  ) {
    return false;
  }

  const key = keyFor(root, preview);
  if (!key) return false;

  setBusy(preview, true);
  const url = await requestViewUrl(root, preview);

  if (!currentPreviewStillMatches(root, preview, key)) return false;

  if (!url) {
    setBusy(preview, false);
    const box = preview.querySelector(UNSUPPORTED_BOX);
    if (box) {
      box.classList.remove("incidencias-modal-video-preparing");
      box.textContent = "No se ha podido preparar la vista previa del vídeo. Puedes descargar el archivo e intentarlo de nuevo más tarde.";
    }
    return false;
  }

  return installVideo(root, preview, url);
}

function syncModalObserver() {
  if (!browser()) return false;

  const nextHost = document.querySelector(HOST);
  if (nextHost === modalHost) return Boolean(nextHost);

  modalObserver?.disconnect?.();
  modalObserver = null;
  modalHost = nextHost || null;

  if (modalHost && typeof MutationObserver !== "undefined") {
    modalObserver = new MutationObserver(schedule);
    modalObserver.observe(modalHost, { childList: true, subtree: true });
  }

  return Boolean(modalHost);
}

function sync() {
  frame = 0;
  if (!browser() || !mounted) return;

  syncModalObserver();

  const root = modalHost?.querySelector?.(ROOT) || null;
  const preview = root?.querySelector?.(PREVIEW) || null;

  if (root && preview && isVideoPreview(preview)) {
    void upgrade(root, preview);
  }
}

function schedule() {
  if (!browser() || !mounted || frame) return false;
  frame = window.requestAnimationFrame(sync);
  return true;
}

export function mountIncidenciasVideoPreview() {
  if (!browser() || mounted) return false;

  mountRoot = document.querySelector(VIEW) || document.body;
  if (!mountRoot || typeof MutationObserver === "undefined") return false;

  mounted = true;
  viewObserver = new MutationObserver(schedule);
  viewObserver.observe(mountRoot, { childList: true, subtree: true });
  schedule();
  return true;
}

export function destroyIncidenciasVideoPreview() {
  if (!browser()) return false;

  mounted = false;
  epoch += 1;

  viewObserver?.disconnect?.();
  modalObserver?.disconnect?.();
  viewObserver = null;
  modalObserver = null;
  modalHost = null;

  if (frame) window.cancelAnimationFrame?.(frame);
  frame = 0;

  cache.clear();
  inflight.clear();
  mountRoot = null;
  return true;
}

export function getIncidenciasVideoPreviewSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_VIDEO_PREVIEW_VERSION,
    mounted,
    modalMounted: Boolean(modalHost?.isConnected),
    cacheEntries: cache.size,
    inflight: inflight.size,
    policy: Object.freeze({
      canonicalViewEndpointOnly: true,
      privateBlobLocatorRejectedByApi: true,
      nativeVideo: true,
      iphoneMov: true,
      preload: "metadata",
      codecFallback: true,
      sasExpiryRetry: true,
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

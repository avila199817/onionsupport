/* =========================================================
   Onion Support - Global Avatar System
   Archivo: /src/features/avatar-system/index.js

   Única autoridad de estado para avatares del área autenticada.

   Responsabilidades:
   - Sincronizar cualquier avatar renderizado o añadido después por la SPA.
   - Mantener un contrato único: loading -> image | fallback | error.
   - Preservar alfa real: una imagen válida nunca conserva gradiente/iniciales
     detrás, independientemente de que sea PNG, WebP, AVIF, JPEG o SVG.
   - Reparar imágenes rotas sin mostrar el icono nativo del navegador.
   - Reutilizar las clases y data-* legacy para no romper vistas existentes.
   - No descargar, transformar, rasterizar ni analizar píxeles.
========================================================= */

"use strict";

export const AVATAR_SYSTEM_VERSION =
  "avatar-system.v1-transparent-alpha-authority";

const MOUNT_KEY = "__ONION_AVATAR_SYSTEM__";
const MAX_HOST_DEPTH = 6;

const HOST_QUERY = [
  "[data-avatar-system]",
  "[data-avatar-host]",
  "[data-has-avatar]",
  "[data-avatar-tone]",
  ".ui-avatar",
  ".ui-detail-modal-avatar-frame",
  '[class*="avatar"]',
].join(",");

const FALLBACK_QUERY = [
  "[data-avatar-fallback]",
  '[class*="avatar-fallback"]',
  '[class*="avatar-initial"]',
  '[class*="avatar-placeholder"]',
].join(",");

const AVATAR_HOST_TOKEN =
  /(?:^|[-_])avatar(?:$|[-_](?:frame|shell|wrap|wrapper|preview|container|box|slot|circle|thumb|media))$/i;

const AVATAR_IMAGE_TOKEN =
  /(?:^|[-_])avatar(?:[-_](?:img|image|photo|picture))$/i;

const AVATAR_FALLBACK_TOKEN =
  /(?:^|[-_])avatar(?:[-_](?:fallback|initial|initials|placeholder))$/i;

let observer = null;
let scanQueued = false;
let active = false;

const pendingRoots = new Set();
const lastImageSource = new WeakMap();

const counters = {
  scans: 0,
  hosts: 0,
  images: 0,
  imageStates: 0,
  fallbackStates: 0,
  errorStates: 0,
};

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isElement(value = null) {
  return Boolean(
    value &&
    value.nodeType === 1 &&
    typeof value.getAttribute === "function"
  );
}

function isDocument(value = null) {
  return Boolean(value && value.nodeType === 9);
}

function isImage(value = null) {
  return Boolean(
    isElement(value) &&
    String(value.tagName || "").toUpperCase() === "IMG"
  );
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function classTokens(value = "") {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => classTokens(item))
      .filter(Boolean);
  }

  if (isElement(value)) {
    return [...(value.classList || [])]
      .map((token) => cleanText(token))
      .filter(Boolean);
  }

  return cleanText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function isAvatarHostClassName(value = "") {
  return classTokens(value).some((token) => AVATAR_HOST_TOKEN.test(token));
}

export function isAvatarImageClassName(value = "") {
  return classTokens(value).some((token) => AVATAR_IMAGE_TOKEN.test(token));
}

export function isAvatarFallbackClassName(value = "") {
  return classTokens(value).some((token) => AVATAR_FALLBACK_TOKEN.test(token));
}

export function resolveAvatarImageState(input = {}) {
  const source = cleanText(input?.source || "");
  const failed = input?.failed === true;
  const hidden = input?.hidden === true;
  const complete = input?.complete === true;
  const naturalWidth = Number(input?.naturalWidth || 0);
  const naturalHeight = Number(input?.naturalHeight || 0);

  if (!source) return "fallback";
  if (failed) return "error";
  if (hidden) return "fallback";
  if (!complete) return "loading";

  return naturalWidth > 0 && naturalHeight > 0
    ? "image"
    : "error";
}

function isOptedOut(node = null) {
  if (!isElement(node)) return true;

  return (
    node.getAttribute("data-avatar-system") === "off" ||
    node.getAttribute("data-avatar-managed") === "false"
  );
}

function hasAvatarData(node = null) {
  if (!isElement(node)) return false;

  return Boolean(
    node.hasAttribute("data-avatar-host") ||
    node.hasAttribute("data-has-avatar") ||
    node.hasAttribute("data-avatar-tone") ||
    (
      node.hasAttribute("data-avatar-system") &&
      node.getAttribute("data-avatar-system") !== "off"
    )
  );
}

function hasFallbackHint(node = null) {
  if (!isElement(node)) return false;

  return Boolean(
    node.hasAttribute("data-avatar-fallback") ||
    isAvatarFallbackClassName(node)
  );
}

function directChildren(node = null) {
  return isElement(node)
    ? [...(node.children || [])]
    : [];
}

function hasDirectImage(node = null) {
  return directChildren(node).some((child) => {
    if (isImage(child)) return true;

    return (
      String(child.tagName || "").toUpperCase() === "PICTURE" &&
      Boolean(child.querySelector?.("img"))
    );
  });
}

function hasDirectFallback(node = null) {
  return directChildren(node).some(hasFallbackHint);
}

function isLikelyAvatarHost(node = null) {
  if (!isElement(node) || isImage(node) || isOptedOut(node)) return false;
  if (hasAvatarData(node)) return true;

  if (!isAvatarHostClassName(node)) return false;

  return Boolean(
    hasDirectImage(node) ||
    hasDirectFallback(node) ||
    node.children?.length === 0 ||
    node.querySelector?.("img")
  );
}

function hostScore(node = null, image = null, depth = 0) {
  if (!isLikelyAvatarHost(node)) return Number.NEGATIVE_INFINITY;

  let score = 100 - (Math.max(0, depth) * 5);

  if (node.getAttribute("data-avatar-system") === "true") score += 1000;
  if (node.getAttribute("data-avatar-host") === "true") score += 900;
  if (node.hasAttribute("data-has-avatar")) score += 800;
  if (node.hasAttribute("data-avatar-tone")) score += 600;
  if (isAvatarHostClassName(node)) score += 400;
  if (image?.parentElement === node) score += 180;
  if (hasDirectImage(node)) score += 140;
  if (hasDirectFallback(node)) score += 120;

  return score;
}

export function findAvatarHost(image = null) {
  if (!isImage(image)) return null;

  let node = image.parentElement || null;
  let depth = 0;
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  while (
    isElement(node) &&
    depth <= MAX_HOST_DEPTH &&
    !["HTML", "BODY"].includes(String(node.tagName || "").toUpperCase())
  ) {
    const score = hostScore(node, image, depth);

    if (score > bestScore) {
      best = node;
      bestScore = score;
    }

    node = node.parentElement;
    depth += 1;
  }

  if (best) return best;

  return isAvatarImageClassName(image) || hasAvatarData(image)
    ? image
    : null;
}

function nearestAvatarHost(node = null) {
  let current = isElement(node) ? node.parentElement : null;
  let depth = 0;

  while (
    isElement(current) &&
    depth <= MAX_HOST_DEPTH &&
    !["HTML", "BODY"].includes(String(current.tagName || "").toUpperCase())
  ) {
    if (isLikelyAvatarHost(current)) return current;
    current = current.parentElement;
    depth += 1;
  }

  return null;
}

function fallbackBelongsToHost(fallback = null, host = null) {
  if (!isElement(fallback) || !isElement(host)) return false;

  let current = fallback.parentElement;

  while (isElement(current) && current !== host) {
    if (isLikelyAvatarHost(current)) return false;
    current = current.parentElement;
  }

  return current === host;
}

function markFallbackNodes(host = null) {
  if (!isElement(host) || !host.querySelectorAll) return 0;

  let marked = 0;

  for (const fallback of host.querySelectorAll(FALLBACK_QUERY)) {
    if (!fallbackBelongsToHost(fallback, host)) continue;

    fallback.setAttribute("data-avatar-fallback", "true");
    marked += 1;
  }

  if (hasFallbackHint(host)) {
    host.setAttribute("data-avatar-fallback", "true");
    marked += 1;
  }

  return marked;
}

function imageSource(image = null) {
  if (!isImage(image)) return "";

  return cleanText(
    image.currentSrc ||
    image.getAttribute("src") ||
    image.getAttribute("srcset") ||
    ""
  );
}

function releaseImageAfterSourceChange(image = null, source = "") {
  if (!isImage(image)) return;

  const previous = lastImageSource.get(image) || "";

  if (source && source !== previous) {
    image.removeAttribute("data-avatar-failed");
    image.removeAttribute("data-avatar-failure-reason");

    if (image.getAttribute("data-avatar-hidden-by-system") === "true") {
      image.hidden = false;
      image.removeAttribute("data-avatar-hidden-by-system");
    }
  }

  lastImageSource.set(image, source);
}

function imageState(image = null) {
  if (!isImage(image)) return "fallback";

  const source = imageSource(image);
  releaseImageAfterSourceChange(image, source);

  return resolveAvatarImageState({
    source,
    failed: image.getAttribute("data-avatar-failed") === "true",
    hidden:
      image.hidden === true &&
      image.getAttribute("data-avatar-hidden-by-system") !== "true",
    complete: image.complete === true,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  });
}

function setAttribute(node = null, name = "", value = "") {
  if (!isElement(node) || !name) return false;

  const next = String(value);
  if (node.getAttribute(name) === next) return false;
  node.setAttribute(name, next);
  return true;
}

function removeAttribute(node = null, name = "") {
  if (!isElement(node) || !name || !node.hasAttribute(name)) return false;
  node.removeAttribute(name);
  return true;
}

function setClass(node = null, className = "", enabled = false) {
  if (!isElement(node) || !node.classList || !className) return false;

  const next = enabled === true;
  if (node.classList.contains(className) === next) return false;
  node.classList.toggle(className, next);
  return true;
}

function applyImageVisibility(image = null, state = "fallback") {
  if (!isImage(image)) return;

  setAttribute(image, "data-avatar-image", "true");

  if (state === "image") {
    image.removeAttribute("data-avatar-failed");
    image.removeAttribute("data-avatar-failure-reason");

    if (image.getAttribute("data-avatar-hidden-by-system") === "true") {
      image.hidden = false;
      image.removeAttribute("data-avatar-hidden-by-system");
    }

    return;
  }

  if (state === "error") {
    image.setAttribute("data-avatar-failed", "true");
    image.setAttribute("data-avatar-hidden-by-system", "true");
    image.hidden = true;
  }
}

function applyHostState(
  host = null,
  image = null,
  state = "fallback",
  reason = ""
) {
  if (!isElement(host) || isOptedOut(host)) return false;

  const hasImage = state === "image";

  setAttribute(host, "data-avatar-system", "true");
  setAttribute(host, "data-avatar-host", "true");
  setAttribute(host, "data-avatar-system-version", AVATAR_SYSTEM_VERSION);
  setAttribute(host, "data-avatar-state", state);
  setAttribute(host, "data-has-avatar", hasImage ? "true" : "false");

  if (reason) {
    setAttribute(host, "data-avatar-state-reason", reason);
  } else {
    removeAttribute(host, "data-avatar-state-reason");
  }

  setClass(host, "has-image", hasImage);
  setClass(host, "is-fallback", !hasImage);
  setClass(host, "is-avatar-loading", state === "loading");
  setClass(host, "is-avatar-error", state === "error");

  markFallbackNodes(host);
  applyImageVisibility(image, state);

  counters.hosts += 1;

  if (state === "image") counters.imageStates += 1;
  if (state === "fallback") counters.fallbackStates += 1;
  if (state === "error") counters.errorStates += 1;

  return true;
}

function avatarImagesInside(host = null) {
  if (!isElement(host)) return [];
  if (isImage(host)) return [host];

  const images = [...(host.querySelectorAll?.("img") || [])];

  return images.filter((image) => {
    const nearest = nearestAvatarHost(image);

    return (
      nearest === host ||
      findAvatarHost(image) === host
    );
  });
}

export function synchronizeAvatarHost(host = null, preferredImage = null) {
  if (!isElement(host) || isOptedOut(host)) return false;

  const images = avatarImagesInside(host);
  const image = isImage(preferredImage) && host.contains?.(preferredImage)
    ? preferredImage
    : images[0] || null;

  if (!image) {
    return applyHostState(host, null, "fallback", "no-image");
  }

  counters.images += 1;

  const state = imageState(image);

  return applyHostState(
    host,
    image,
    state,
    state === "error" ? "load-error" : ""
  );
}

export function synchronizeAvatarImage(image = null) {
  if (!isImage(image)) return false;

  const host = findAvatarHost(image);
  if (!host || isOptedOut(host)) return false;

  return synchronizeAvatarHost(host, image);
}

function addCandidateHost(set, node = null) {
  if (!isElement(node) || !isLikelyAvatarHost(node)) return;
  set.add(node);
}

export function synchronizeAvatars(root = null) {
  if (!isBrowser()) return 0;

  const scope = root || document;
  if (!isElement(scope) && !isDocument(scope)) return 0;

  counters.scans += 1;

  const hosts = new Set();
  const images = [];

  if (isImage(scope)) {
    images.push(scope);
  } else if (isElement(scope)) {
    addCandidateHost(hosts, scope);
  }

  if (scope.querySelectorAll) {
    for (const image of scope.querySelectorAll("img")) {
      images.push(image);
    }

    for (const candidate of scope.querySelectorAll(HOST_QUERY)) {
      addCandidateHost(hosts, candidate);
    }
  }

  for (const image of images) {
    const host = findAvatarHost(image);
    if (host) hosts.add(host);
  }

  let synchronized = 0;

  for (const host of hosts) {
    if (synchronizeAvatarHost(host)) synchronized += 1;
  }

  return synchronized;
}

function queueScan(root = null) {
  if (!isBrowser()) return;

  const candidate =
    isElement(root) || isDocument(root)
      ? root
      : document;

  pendingRoots.add(candidate);

  if (scanQueued) return;
  scanQueued = true;

  queueMicrotask(() => {
    scanQueued = false;

    const roots = [...pendingRoots];
    pendingRoots.clear();

    for (const item of roots) {
      synchronizeAvatars(item);
    }
  });
}

function onImageLoad(event = null) {
  const image = event?.target || null;
  if (!isImage(image)) return;

  image.removeAttribute("data-avatar-failed");
  image.removeAttribute("data-avatar-failure-reason");

  if (image.getAttribute("data-avatar-hidden-by-system") === "true") {
    image.hidden = false;
    image.removeAttribute("data-avatar-hidden-by-system");
  }

  synchronizeAvatarImage(image);
}

function onImageError(event = null) {
  const image = event?.target || null;
  if (!isImage(image)) return;

  const host = findAvatarHost(image);
  if (!host || isOptedOut(host)) return;

  image.setAttribute("data-avatar-failed", "true");
  image.setAttribute("data-avatar-failure-reason", "load-error");
  image.setAttribute("data-avatar-hidden-by-system", "true");
  image.hidden = true;

  applyHostState(host, image, "error", "load-error");
}

function onMutations(records = []) {
  for (const record of records) {
    if (record.type === "childList") {
      for (const node of record.addedNodes || []) {
        if (isElement(node)) queueScan(node);
      }
      continue;
    }

    if (record.type === "attributes") {
      const target = record.target || null;

      if (isImage(target)) {
        queueScan(target);
      }
    }
  }
}

function installObserver() {
  if (!isBrowser() || typeof MutationObserver !== "function") return false;
  if (observer) return true;

  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src", "srcset", "hidden"],
  });

  return true;
}

export function mountAvatarSystem() {
  if (!isBrowser()) return false;

  if (active) {
    synchronizeAvatars(document);
    return true;
  }

  const existing = window[MOUNT_KEY];

  if (
    existing?.mounted === true &&
    existing?.version === AVATAR_SYSTEM_VERSION
  ) {
    active = true;
    synchronizeAvatars(document);
    return true;
  }

  document.addEventListener("load", onImageLoad, true);
  document.addEventListener("error", onImageError, true);
  installObserver();

  active = true;

  window[MOUNT_KEY] = Object.freeze({
    mounted: true,
    version: AVATAR_SYSTEM_VERSION,
  });

  synchronizeAvatars(document);
  return true;
}

export function destroyAvatarSystem() {
  if (!isBrowser()) return false;

  document.removeEventListener("load", onImageLoad, true);
  document.removeEventListener("error", onImageError, true);

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  pendingRoots.clear();
  scanQueued = false;
  active = false;

  try {
    delete window[MOUNT_KEY];
  } catch {
    window[MOUNT_KEY] = null;
  }

  return true;
}

export function getAvatarSystemSnapshot() {
  return Object.freeze({
    version: AVATAR_SYSTEM_VERSION,
    active,
    counters: Object.freeze({ ...counters }),
    policy: Object.freeze({
      validImageClearsFallbackSurface: true,
      transparentPixelsPreserved: true,
      fallbackOnlyWithoutValidImage: true,
      brokenImagesBecomeFallback: true,
      dynamicSpaDomObserved: true,
      imageFormatsAreContentAgnostic: true,
      noPixelInspection: true,
      noNetwork: true,
      noStorage: true,
    }),
  });
}

export const AvatarSystem = Object.freeze({
  version: AVATAR_SYSTEM_VERSION,
  init: mountAvatarSystem,
  mount: mountAvatarSystem,
  sync: synchronizeAvatars,
  destroy: destroyAvatarSystem,
  getSnapshot: getAvatarSystemSnapshot,
});

export default AvatarSystem;

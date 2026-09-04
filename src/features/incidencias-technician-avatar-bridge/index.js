/* =========================================================
   Onion Support · Incidencias Technician Avatar Bridge

   GLOBAL AVATAR SOURCE REUSE · NO SYNTHETIC PHOTO AUTHORITY

   Responsabilidad:
   - Hacer que el perfil de Técnico reutilice la misma imagen válida que el
     AvatarSystem ya conoce/renderiza para esa identidad en otra superficie.
   - Nunca decidir iniciales, tone, color ni estado visual: eso pertenece al
     AvatarSystem global.
   - Retirar el fallback editorial histórico de Cristian cuando no existe una
     imagen canónica de usuario que lo respalde en el runtime.
   - Sin HTTP, storage, persistencia ni paletas locales.
========================================================= */

"use strict";

import AvatarSystem, {
  normalizeAvatarEmail,
  normalizeAvatarName,
  normalizeAvatarUserId,
  normalizeAvatarUsername,
} from "../avatar-system/index.js";

export const INCIDENCIAS_TECHNICIAN_AVATAR_BRIDGE_VERSION =
  "incidencias-technician-avatar-bridge.v1-global-source-authority";

/*
  Este path NO es una fuente que el bridge pueda inyectar. Es justo lo
  contrario: identifica el fallback editorial que el perfil v8 heredó de la
  Home para poder retirarlo. La autoridad real debe venir de otro avatar global
  válido de la misma identidad o del avatar de usuario ya recibido por el modal.
*/
export const SYNTHETIC_TECHNICIAN_IMAGE_PATH =
  "/src/media/img/Cristian_Avila_224.webp";

const TARGET_QUERY =
  "[data-technician-profile-root='true'] [data-avatar-source='incidencias-technician-profile'][data-avatar-host='true']";

const GLOBAL_IMAGE_HOST_QUERY = [
  "[data-avatar-authority='global'][data-avatar-state='image'][data-avatar-host='true']",
  "[data-avatar-authority='global'][data-avatar-state='image'][data-avatar-system='true']",
].join(",");

const OBSERVED_ATTRIBUTES = Object.freeze([
  "src",
  "srcset",
  "hidden",
  "data-avatar-state",
  "data-avatar-identity",
  "data-avatar-user-id",
  "data-avatar-email",
  "data-avatar-username",
  "data-avatar-name",
]);

let mounted = false;
let observer = null;
let frame = 0;

const counters = {
  scans: 0,
  targets: 0,
  canonicalReuses: 0,
  syntheticRemoved: 0,
  nativePreserved: 0,
  fallbacks: 0,
};

function browser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function element(value = null) {
  return Boolean(
    value &&
    value.nodeType === 1 &&
    typeof value.getAttribute === "function"
  );
}

function documentNode(value = null) {
  return Boolean(value && value.nodeType === 9);
}

function clean(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteSource(value = "") {
  const raw = clean(value);
  if (!raw) return "";

  try {
    return new URL(raw, browser() ? window.location.href : "https://onionsupport.com/").href;
  } catch {
    return "";
  }
}

function sourcePath(value = "") {
  const href = absoluteSource(value);
  if (!href) return "";

  try {
    return new URL(href).pathname.replace(/\/{2,}/g, "/");
  } catch {
    return "";
  }
}

export function isSyntheticTechnicianSource(value = "") {
  return sourcePath(value).toLowerCase() ===
    SYNTHETIC_TECHNICIAN_IMAGE_PATH.toLowerCase();
}

function imageSource(image = null) {
  if (!element(image) || String(image.tagName || "").toUpperCase() !== "IMG") {
    return "";
  }

  return clean(
    image.currentSrc ||
    image.getAttribute("src") ||
    ""
  );
}

function usableImage(image = null) {
  if (!element(image) || String(image.tagName || "").toUpperCase() !== "IMG") {
    return false;
  }

  const source = imageSource(image);
  if (!source || isSyntheticTechnicianSource(source)) return false;
  if (image.hidden === true) return false;
  if (image.getAttribute("data-avatar-failed") === "true") return false;

  return Boolean(
    image.complete === true &&
    Number(image.naturalWidth || 0) > 0 &&
    Number(image.naturalHeight || 0) > 0
  );
}

function hostIdentity(host = null) {
  if (!element(host)) return Object.freeze({});

  return Object.freeze({
    fingerprint: clean(host.dataset?.avatarIdentity || ""),
    userId: normalizeAvatarUserId(
      host.dataset?.avatarUserId || host.dataset?.userId || ""
    ),
    email: normalizeAvatarEmail(
      host.dataset?.avatarEmail || host.dataset?.userEmail || host.dataset?.email || ""
    ),
    username: normalizeAvatarUsername(
      host.dataset?.avatarUsername || host.dataset?.username || ""
    ),
    name: normalizeAvatarName(
      host.dataset?.avatarName || host.dataset?.userName || ""
    ),
  });
}

export function sameAvatarIdentity(left = {}, right = {}) {
  const a = left || {};
  const b = right || {};

  if (a.fingerprint && b.fingerprint) {
    return a.fingerprint === b.fingerprint;
  }
  if (a.userId && b.userId) return a.userId === b.userId;
  if (a.email && b.email) return a.email === b.email;
  if (a.username && b.username) return a.username === b.username;

  return Boolean(
    a.name &&
    b.name &&
    a.name.length >= 5 &&
    a.name === b.name
  );
}

function targetImages(target = null) {
  if (!element(target)) return [];
  return [...(target.querySelectorAll?.("img") || [])];
}

function currentTargetImage(target = null) {
  return targetImages(target)[0] || null;
}

function globalSourceFor(target = null) {
  if (!element(target) || !browser()) return null;

  const identity = hostIdentity(target);
  const profileRoot = target.closest?.("[data-technician-profile-root='true']") || null;

  for (const candidate of document.querySelectorAll(GLOBAL_IMAGE_HOST_QUERY)) {
    if (!element(candidate) || candidate === target) continue;
    if (profileRoot?.contains?.(candidate)) continue;
    if (!sameAvatarIdentity(identity, hostIdentity(candidate))) continue;

    const image = candidate.querySelector?.("[data-avatar-image='true'], img") || null;
    if (!usableImage(image)) continue;

    const source = imageSource(image);
    if (!source) continue;

    return Object.freeze({
      host: candidate,
      image,
      source,
    });
  }

  return null;
}

function ensureImage(target = null, source = "") {
  if (!element(target) || !source) return null;

  let image = currentTargetImage(target);
  if (!image) {
    image = document.createElement("img");
    image.alt = "";
    image.loading = "eager";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.draggable = false;
    image.setAttribute("data-avatar-image", "true");

    const fallback = target.querySelector?.("[data-avatar-fallback='true']") || null;
    target.insertBefore(image, fallback || target.firstChild || null);
  }

  image.setAttribute("data-avatar-image", "true");
  image.removeAttribute("data-avatar-failed");
  image.removeAttribute("data-avatar-failure-reason");
  image.removeAttribute("data-avatar-hidden-by-system");
  image.hidden = false;

  const current = absoluteSource(image.getAttribute("src") || "");
  const next = absoluteSource(source);
  if (next && current !== next) image.src = next;

  return image;
}

function removeSyntheticImages(target = null) {
  if (!element(target)) return 0;

  let removed = 0;
  for (const image of targetImages(target)) {
    if (!isSyntheticTechnicianSource(imageSource(image))) continue;
    image.remove();
    removed += 1;
  }
  return removed;
}

function synchronizeTarget(target = null) {
  if (!element(target)) return false;
  counters.targets += 1;

  const current = currentTargetImage(target);
  const currentSource = imageSource(current);

  /*
    Un avatar ya recibido del usuario/backend es canónico para este host.
    Sólo el path editorial conocido se considera sintético y se subordina.
  */
  if (current && currentSource && !isSyntheticTechnicianSource(currentSource)) {
    AvatarSystem.syncHost?.(target, current);
    counters.nativePreserved += 1;
    return true;
  }

  const canonical = globalSourceFor(target);
  if (canonical?.source) {
    removeSyntheticImages(target);
    const image = ensureImage(target, canonical.source);
    AvatarSystem.syncHost?.(target, image);
    counters.canonicalReuses += 1;
    return true;
  }

  const removed = removeSyntheticImages(target);
  if (removed) counters.syntheticRemoved += removed;

  /*
    Sin imagen canónica no inventamos una. AvatarSystem decide el fallback,
    incluidas iniciales, Microsoft tone, estado y clases.
  */
  AvatarSystem.syncHost?.(target);
  counters.fallbacks += 1;
  return true;
}

export function synchronizeTechnicianAvatarBridge(root = null) {
  if (!browser()) return 0;

  const scope = root || document;
  if (!element(scope) && !documentNode(scope)) return 0;

  /*
    Primero dejamos que la autoridad global selle identity/state en todas las
    superficies. Después sólo reutilizamos una imagen cuya identidad coincida.
  */
  AvatarSystem.sync?.(scope);
  counters.scans += 1;

  const targets = new Set();
  if (element(scope) && scope.matches?.(TARGET_QUERY)) targets.add(scope);
  for (const target of scope.querySelectorAll?.(TARGET_QUERY) || []) {
    targets.add(target);
  }

  let synchronized = 0;
  for (const target of targets) {
    if (synchronizeTarget(target)) synchronized += 1;
  }

  return synchronized;
}

function schedule() {
  if (!browser() || !mounted || frame) return false;

  frame = window.requestAnimationFrame(() => {
    frame = 0;
    synchronizeTechnicianAvatarBridge(document);
  });
  return true;
}

function onMutations(records = []) {
  for (const record of records) {
    if (record.type === "childList") {
      if ((record.addedNodes?.length || 0) > 0 || (record.removedNodes?.length || 0) > 0) {
        schedule();
        return;
      }
      continue;
    }

    if (record.type === "attributes") {
      schedule();
      return;
    }
  }
}

export function mountIncidenciasTechnicianAvatarBridge() {
  if (!browser()) return false;
  if (mounted) {
    synchronizeTechnicianAvatarBridge(document);
    return true;
  }

  mounted = true;

  if (typeof MutationObserver === "function") {
    observer = new MutationObserver(onMutations);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [...OBSERVED_ATTRIBUTES],
    });
  }

  synchronizeTechnicianAvatarBridge(document);
  return true;
}

export function destroyIncidenciasTechnicianAvatarBridge() {
  if (!browser() || !mounted) return false;

  mounted = false;
  observer?.disconnect?.();
  observer = null;

  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
  return true;
}

export function getIncidenciasTechnicianAvatarBridgeSnapshot() {
  return Object.freeze({
    version: INCIDENCIAS_TECHNICIAN_AVATAR_BRIDGE_VERSION,
    mounted,
    counters: Object.freeze({ ...counters }),
    policy: Object.freeze({
      avatarAuthority: "global-avatar-system",
      canonicalImageReuse: true,
      syntheticPhotoAuthority: false,
      noNetwork: true,
      noStorage: true,
      noLocalInitials: true,
      noLocalTone: true,
      noLocalColor: true,
    }),
  });
}

export const IncidenciasTechnicianAvatarBridge = Object.freeze({
  version: INCIDENCIAS_TECHNICIAN_AVATAR_BRIDGE_VERSION,
  init: mountIncidenciasTechnicianAvatarBridge,
  mount: mountIncidenciasTechnicianAvatarBridge,
  sync: synchronizeTechnicianAvatarBridge,
  destroy: destroyIncidenciasTechnicianAvatarBridge,
  getSnapshot: getIncidenciasTechnicianAvatarBridgeSnapshot,
});

export default IncidenciasTechnicianAvatarBridge;

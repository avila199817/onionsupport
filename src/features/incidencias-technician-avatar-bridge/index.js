/* =========================================================
   Onion Support · Incidencias Technician Avatar Bridge

   GLOBAL AVATAR AUTHORITY · NESTED HOST SAFE · NO SYNTHETIC PHOTO

   Responsabilidad:
   - El único host de avatar del perfil Técnico es su frame interior.
   - El wrapper visual .ui-detail-modal-avatar nunca puede ser promovido por
     el descubrimiento legacy de AvatarSystem como un segundo avatar anidado.
   - Una foto real ya validada por AvatarSystem para la misma identidad puede
     reutilizarse en el perfil.
   - El retrato editorial histórico NO es una autoridad de avatar.
   - Iniciales, tone, color y state pertenecen exclusivamente a AvatarSystem.
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
  "incidencias-technician-avatar-bridge.v2-nested-host-boundary";

export const SYNTHETIC_TECHNICIAN_IMAGE_PATH =
  "/src/media/img/Cristian_Avila_224.webp";

const PROFILE_ROOT_QUERY =
  "[data-technician-profile-root='true']";

const TARGET_QUERY =
  `${PROFILE_ROOT_QUERY} [data-avatar-source='incidencias-technician-profile'][data-avatar-host='true']`;

/*
  Deliberadamente NO exigimos data-avatar-state=image aquí. Una imagen puede
  haber terminado de cargar antes de que el state attribute se reconcilie. La
  validación real se hace contra complete/naturalWidth/naturalHeight y contra
  los flags del propio AvatarSystem.
*/
const GLOBAL_IMAGE_HOST_QUERY =
  "[data-avatar-authority='global'][data-avatar-host='true']";

const IDENTITY_SCOPE_QUERY = [
  "[data-modal-technician='true']",
  ".incidencias-assigned-badge",
  "[data-ticket-row='true']",
  "[data-incidencias-modal-root='true']",
  PROFILE_ROOT_QUERY,
].join(",");

const WRAPPER_AVATAR_ATTRIBUTES = Object.freeze([
  "data-avatar-host",
  "data-avatar-authority",
  "data-avatar-state",
  "data-avatar-state-reason",
  "data-avatar-system-version",
  "data-avatar-identity-version",
  "data-avatar-identity",
  "data-avatar-tone",
  "data-avatar-initials",
  "data-has-avatar",
]);

const OBSERVED_ATTRIBUTES = Object.freeze([
  "src",
  "srcset",
  "hidden",
  "data-avatar-state",
  "data-avatar-authority",
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
  wrappersQuarantined: 0,
  identitiesSealed: 0,
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
    return new URL(
      raw,
      browser() ? window.location.href : "https://onionsupport.com/"
    ).href;
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
  if (
    !element(image) ||
    String(image.tagName || "").toUpperCase() !== "IMG"
  ) {
    return "";
  }

  return clean(
    image.currentSrc ||
    image.getAttribute("src") ||
    image.getAttribute("srcset") ||
    ""
  );
}

function usableImage(image = null) {
  if (
    !element(image) ||
    String(image.tagName || "").toUpperCase() !== "IMG"
  ) {
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

function scopeFor(host = null) {
  if (!element(host)) return null;

  try {
    return host.closest?.(IDENTITY_SCOPE_QUERY) || host.parentElement || host;
  } catch {
    return host.parentElement || host;
  }
}

function datasetValue(nodes = [], keys = []) {
  for (const node of nodes) {
    if (!element(node)) continue;

    for (const key of keys) {
      const value = clean(node.dataset?.[key] || "");
      if (value) return value;
    }
  }

  return "";
}

function mailFromHref(value = "") {
  const href = clean(value);
  if (!/^mailto:/i.test(href)) return "";

  try {
    return normalizeAvatarEmail(
      decodeURIComponent(
        href.replace(/^mailto:/i, "").split("?")[0] || ""
      )
    );
  } catch {
    return "";
  }
}

function scopedEmail(scope = null) {
  if (!element(scope)) return "";

  const node = scope.querySelector?.(
    ".incidencias-modal-technician-email, a[href^='mailto:'], [data-avatar-email], [data-user-email]"
  );
  if (!element(node)) return "";

  return normalizeAvatarEmail(
    node.dataset?.avatarEmail ||
    node.dataset?.userEmail ||
    mailFromHref(node.getAttribute?.("href") || "") ||
    node.textContent ||
    ""
  );
}

function scopedName(scope = null) {
  if (!element(scope)) return "";

  const node = scope.querySelector?.(
    ".incidencias-assigned-name, .incidencias-modal-technician-copy strong, [data-avatar-name], [data-user-name], #inc-technician-title"
  );

  return normalizeAvatarName(
    node?.dataset?.avatarName ||
    node?.dataset?.userName ||
    node?.textContent ||
    ""
  );
}

function hostIdentity(host = null) {
  if (!element(host)) return Object.freeze({});

  const scope = scopeFor(host);
  const nodes = [host, scope];

  return Object.freeze({
    fingerprint: clean(host.dataset?.avatarIdentity || ""),
    userId: normalizeAvatarUserId(
      datasetValue(nodes, [
        "avatarUserId",
        "technicianUserId",
        "tecnicoUserId",
        "userId",
        "usuarioId",
      ])
    ),
    email: normalizeAvatarEmail(
      datasetValue(nodes, [
        "avatarEmail",
        "technicianEmail",
        "userEmail",
        "email",
      ]) || scopedEmail(scope)
    ),
    username: normalizeAvatarUsername(
      datasetValue(nodes, [
        "avatarUsername",
        "username",
        "usernameLower",
      ])
    ),
    name: normalizeAvatarName(
      datasetValue(nodes, [
        "avatarName",
        "technicianName",
        "userName",
        "displayName",
      ]) || scopedName(scope)
    ),
  });
}

export function avatarIdentityMatchScore(left = {}, right = {}) {
  const a = left || {};
  const b = right || {};

  if (a.userId && b.userId) {
    return a.userId === b.userId ? 1000 : -1;
  }

  if (a.email && b.email) {
    return a.email === b.email ? 900 : -1;
  }

  if (a.username && b.username) {
    return a.username === b.username ? 800 : -1;
  }

  if (
    a.fingerprint &&
    b.fingerprint &&
    a.fingerprint === b.fingerprint
  ) {
    return 700;
  }

  if (
    a.name &&
    b.name &&
    a.name.length >= 5 &&
    a.name === b.name
  ) {
    return 500;
  }

  return -1;
}

export function sameAvatarIdentity(left = {}, right = {}) {
  return avatarIdentityMatchScore(left, right) >= 0;
}

function profileRootFor(target = null) {
  return element(target)
    ? target.closest?.(PROFILE_ROOT_QUERY) || null
    : null;
}

function sealTargetIdentity(target = null) {
  if (!element(target)) return false;

  const root = profileRootFor(target);
  let changed = false;

  target.setAttribute("data-avatar-system", "true");
  target.setAttribute("data-avatar-host", "true");

  if (!clean(target.dataset?.avatarName || "")) {
    const name = clean(
      root?.querySelector?.("#inc-technician-title")?.textContent || ""
    );
    if (name) {
      target.dataset.avatarName = name;
      changed = true;
    }
  }

  if (!normalizeAvatarEmail(target.dataset?.avatarEmail || "")) {
    const emailNode = root?.querySelector?.(
      "a.inc-technician-contact-card[href^='mailto:'], a[href^='mailto:']"
    );
    const email = mailFromHref(emailNode?.getAttribute?.("href") || "");
    if (email) {
      target.dataset.avatarEmail = email;
      changed = true;
    }
  }

  const fallback = target.querySelector?.(
    "[data-avatar-fallback='true'], .ui-detail-modal-avatar-fallback"
  );
  if (element(fallback)) {
    fallback.setAttribute("data-avatar-fallback", "true");
  }

  if (changed) counters.identitiesSealed += 1;
  return true;
}

/*
  CAUSA RAÍZ DEL BUG DE LA CAPTURA:
  .ui-detail-modal-avatar es un wrapper de layout que contiene el frame real.
  El descubrimiento legacy `[class*=avatar]` podía promover también ese wrapper.
  Al no tener identidad propia, acababa leyendo el texto "CL" del fallback del
  hijo como nombre. Fluent Persona("CL") => tone 19 (#69797E). Además el wrapper
  no tiene fallback propio, por eso se veía exactamente un círculo gris vacío.

  Lo convertimos en frontera explícita opt-out y retiramos cualquier estado que
  una pasada anterior hubiera pintado sobre él.
*/
export function quarantineNestedAvatarWrapper(target = null) {
  if (!element(target)) return false;

  const wrapper = target.closest?.(".ui-detail-modal-avatar") || null;
  if (!element(wrapper) || wrapper === target) return false;

  const alreadyQuarantined =
    wrapper.getAttribute("data-avatar-system") === "off" &&
    wrapper.getAttribute("data-avatar-managed") === "false";

  wrapper.setAttribute("data-avatar-system", "off");
  wrapper.setAttribute("data-avatar-managed", "false");

  for (const name of WRAPPER_AVATAR_ATTRIBUTES) {
    wrapper.removeAttribute(name);
  }

  wrapper.classList?.remove?.(
    "has-image",
    "is-fallback",
    "is-avatar-loading",
    "is-avatar-error"
  );

  if (!alreadyQuarantined) counters.wrappersQuarantined += 1;
  return true;
}

function targetImages(target = null) {
  if (!element(target)) return [];
  return [...(target.querySelectorAll?.("img") || [])];
}

function currentTargetImage(target = null) {
  return targetImages(target)[0] || null;
}

function removeSyntheticImages(target = null) {
  if (!element(target)) return 0;

  let removed = 0;
  for (const image of targetImages(target)) {
    if (!isSyntheticTechnicianSource(imageSource(image))) continue;
    image.remove();
    removed += 1;
  }

  if (removed) counters.syntheticRemoved += removed;
  return removed;
}

function candidateImage(host = null) {
  if (!element(host)) return null;

  for (const image of host.querySelectorAll?.("[data-avatar-image='true'], img") || []) {
    if (usableImage(image)) return image;
  }

  return null;
}

function globalSourceFor(target = null) {
  if (!element(target) || !browser()) return null;

  const identity = hostIdentity(target);
  const profileRoot = profileRootFor(target);
  const matches = [];

  for (const candidate of document.querySelectorAll(GLOBAL_IMAGE_HOST_QUERY)) {
    if (!element(candidate) || candidate === target) continue;
    if (candidate.getAttribute("data-avatar-system") === "off") continue;
    if (profileRoot?.contains?.(candidate)) continue;

    const score = avatarIdentityMatchScore(
      identity,
      hostIdentity(candidate)
    );
    if (score < 0) continue;

    const image = candidateImage(candidate);
    if (!image) continue;

    const source = imageSource(image);
    if (!source) continue;

    matches.push({ candidate, image, source, score });
  }

  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  if (!best) return null;

  return Object.freeze({
    host: best.candidate,
    image: best.image,
    source: best.source,
    score: best.score,
  });
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

function setBridgeState(target = null, state = "") {
  if (!element(target)) return;
  if (state) target.dataset.avatarBridgeState = state;
  else delete target.dataset.avatarBridgeState;
}

function synchronizeTarget(target = null) {
  if (!element(target)) return false;
  counters.targets += 1;

  quarantineNestedAvatarWrapper(target);
  sealTargetIdentity(target);

  const current = currentTargetImage(target);
  const currentSource = imageSource(current);
  const currentFailed =
    current?.getAttribute?.("data-avatar-failed") === "true" ||
    current?.hidden === true;

  /*
    Si el perfil ya recibió una fuente real del ticket / usuario, no la
    sustituimos. AvatarSystem decide loading -> image | error.
  */
  if (
    current &&
    currentSource &&
    !isSyntheticTechnicianSource(currentSource) &&
    !currentFailed
  ) {
    AvatarSystem.syncHost?.(target, current);
    setBridgeState(target, "native");
    counters.nativePreserved += 1;
    return true;
  }

  /* La foto editorial nunca participa en el matching ni en el state global. */
  removeSyntheticImages(target);
  AvatarSystem.syncHost?.(target);

  const canonical = globalSourceFor(target);
  if (canonical?.source) {
    const image = ensureImage(target, canonical.source);
    AvatarSystem.syncHost?.(target, image);
    setBridgeState(target, "reused-global");
    counters.canonicalReuses += 1;
    return true;
  }

  /*
    Sin fuente canónica, no inventamos imagen. Este segundo sync es deliberado:
    garantiza que una imagen sintética recién eliminada no deje state=image
    ni el fallback oculto por una carrera de MutationObserver.
  */
  AvatarSystem.syncHost?.(target);
  setBridgeState(target, "fallback-global");
  counters.fallbacks += 1;
  return true;
}

function collectTargets(scope = document) {
  const targets = new Set();

  if (element(scope) && scope.matches?.(TARGET_QUERY)) {
    targets.add(scope);
  }

  for (const target of scope.querySelectorAll?.(TARGET_QUERY) || []) {
    targets.add(target);
  }

  return targets;
}

export function synchronizeTechnicianAvatarBridge(root = null) {
  if (!browser()) return 0;

  const scope = root || document;
  if (!element(scope) && !documentNode(scope)) return 0;

  counters.scans += 1;
  const targets = collectTargets(scope);
  if (!targets.size && scope !== document) return 0;

  /*
    1) Cerramos primero la frontera anidada para que el scan global nunca pueda
       volver a convertir el wrapper de layout en otro avatar.
    2) Retiramos la fuente editorial ANTES del scan global.
    3) AvatarSystem reconcilia el documento y deja candidatos reales sellados.
    4) Sólo entonces reutilizamos una fuente global de la misma identidad.
  */
  for (const target of targets) {
    quarantineNestedAvatarWrapper(target);
    sealTargetIdentity(target);
    removeSyntheticImages(target);
  }

  AvatarSystem.sync?.(document);

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
      if (
        (record.addedNodes?.length || 0) > 0 ||
        (record.removedNodes?.length || 0) > 0
      ) {
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
      nestedWrapperOptOut: true,
      canonicalImageReuse: true,
      syntheticPhotoAuthority: false,
      syntheticRemovedBeforeGlobalSync: true,
      fallbackResynchronizedAfterRemoval: true,
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

/* =========================================================
   Onion Support · Incidencias Follow-up Avatars

   VISUAL ADAPTER · GLOBAL AVATAR AUTHORITY

   Responsabilidad:
   - Montar el avatar de cada autor en "Seguimiento".
   - Resolver identidad desde el detalle hidratado antes del primer paint.
   - Reutilizar foto real de solicitante/técnico cuando existe.
   - Delegar iniciales, tone, image/fallback y errores a AvatarSystem.
   - No mantener paleta, hash, listeners de imagen ni internals ajenos.
========================================================= */

"use strict";

import "./style.css";

import {
  loadIncidenciaDetail,
} from "../../views/incidencias/incidencias.api.js";

import {
  resolveAvatarPresentation,
} from "../avatar-system/identity.js";

import {
  buildCommentIdentityIndex,
  commentAvatarIdentity,
  requesterIdentity,
  resolveCommentIdentity,
  resolveCommentProfile,
  technicianIdentity,
} from "../incidencias-comment-identity/index.js";

export const INCIDENCIAS_FOLLOWUP_AVATARS_VERSION =
  "incidencias.followup-avatars.v6.global-avatar-authority";

const MODAL_SELECTOR =
  "[data-incidencias-modal-root='true']";

const COMMENT_HEAD_SELECTOR =
  ".incidencias-modal-description-comment-head";

const REQUESTER_SELECTOR =
  ".incidencias-modal-avatar[title]";

const TECHNICIAN_SELECTOR =
  "[data-modal-technician='true'][data-technician-assigned='true']";

const REQUESTER_IMAGE_SELECTOR =
  "[data-modal-avatar-img='true']";

const TECHNICIAN_IMAGE_SELECTOR =
  "[data-modal-technician-avatar-img='true']";

const AUTHOR_WRAP_CLASS =
  "incidencias-modal-description-comment-author";

const AVATAR_CLASS =
  "incidencias-modal-description-comment-avatar";

const AVATAR_IMAGE_CLASS =
  "incidencias-modal-description-comment-avatar-image";

const AVATAR_FALLBACK_CLASS =
  "incidencias-modal-description-comment-avatar-fallback";

const MOUNT_KEY =
  "__ONION_INCIDENCIAS_FOLLOWUP_AVATARS__";

const modalState = new WeakMap();
let observer = null;
let queued = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function text(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanImageSrc(image = null) {
  if (!image || image.hidden === true) return "";
  return text(image.getAttribute?.("src") || "");
}

function ticketId(modal = null) {
  return text(modal?.dataset?.ticketId || "");
}

function unwrapDetail(value = null) {
  if (!value || typeof value !== "object") return {};

  for (const candidate of [
    value.detail,
    value.ticket,
    value.incidencia,
    value.item,
    value.data,
    value,
  ]) {
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).length
    ) {
      return candidate;
    }
  }

  return {};
}

function requesterProfile(modal = null, detail = {}) {
  const host = modal?.querySelector?.(REQUESTER_SELECTOR) || null;
  const image = host?.querySelector?.(REQUESTER_IMAGE_SELECTOR) || null;
  const name = text(host?.getAttribute?.("title") || "");
  const identity = requesterIdentity(detail);

  if (!name) return null;

  return Object.freeze({
    name,
    src: cleanImageSrc(image),
    source: "requester",
    ...identity,
  });
}

function technicianProfile(modal = null, detail = {}) {
  const host = modal?.querySelector?.(TECHNICIAN_SELECTOR) || null;
  const image = host?.querySelector?.(TECHNICIAN_IMAGE_SELECTOR) || null;
  const name = text(
    host?.querySelector?.(".incidencias-modal-technician-copy strong")?.textContent ||
      host?.querySelector?.("strong")?.textContent ||
      ""
  );
  const identity = technicianIdentity(detail);

  if (!name) return null;

  return Object.freeze({
    name,
    src: cleanImageSrc(image),
    source: "technician",
    ...identity,
  });
}

function profiles(modal = null, detail = {}) {
  return [
    requesterProfile(modal, detail),
    technicianProfile(modal, detail),
  ].filter(Boolean);
}

function directAuthor(head = null) {
  if (!head?.querySelector) return null;

  return (
    head.querySelector(`:scope > .${AUTHOR_WRAP_CLASS} > strong`) ||
    head.querySelector(":scope > strong") ||
    null
  );
}

function removeAvatar(head = null) {
  const wrap = head?.querySelector?.(`:scope > .${AUTHOR_WRAP_CLASS}`) || null;
  const avatar = wrap?.querySelector?.(`:scope > .${AVATAR_CLASS}`) || null;

  avatar?.remove?.();

  if (wrap && !wrap.querySelector(":scope > strong")) {
    wrap.remove();
  }

  delete head?.dataset?.followupAvatarSource;
  delete head?.dataset?.followupAvatarAuthor;
  return Boolean(avatar);
}

function ensureAuthorWrap(head = null, author = null) {
  if (!head || !author) return null;

  let wrap = head.querySelector?.(`:scope > .${AUTHOR_WRAP_CLASS}`) || null;

  if (!wrap) {
    wrap = document.createElement("span");
    wrap.className = AUTHOR_WRAP_CLASS;
    author.before(wrap);
    wrap.appendChild(author);
  }

  return wrap;
}

function presentationForAuthor(profile = null, authorText = "", identity = null) {
  return resolveAvatarPresentation(commentAvatarIdentity(authorText, identity, profile));
}

function applyStableAvatarIdentityDataset(avatar = null, presentation = {}) {
  if (!avatar) return;

  const name = presentation.name || "";
  const email = presentation.email || "";
  const userId = presentation.userId || "";
  const username = presentation.username || "";

  if (avatar.dataset.avatarName !== name) avatar.dataset.avatarName = name;
  if (avatar.dataset.avatarEmail !== email) avatar.dataset.avatarEmail = email;
  if (avatar.dataset.avatarUserId !== userId) avatar.dataset.avatarUserId = userId;
  if (avatar.dataset.avatarUsername !== username) avatar.dataset.avatarUsername = username;
}

function createAvatar(head = null, profile = null, authorText = "", identity = null) {
  const author = directAuthor(head);
  const wrap = ensureAuthorWrap(head, author);

  if (!wrap || !authorText) return null;

  const presentation = presentationForAuthor(profile, authorText, identity);
  const hasImage = Boolean(profile?.src);

  const avatar = document.createElement("span");
  avatar.className = AVATAR_CLASS;
  avatar.setAttribute("aria-hidden", "true");
  avatar.dataset.followupAvatar = "true";
  avatar.dataset.avatarSystem = "true";
  avatar.dataset.avatarHost = "true";
  avatar.dataset.avatarTone = String(presentation.tone);
  avatar.dataset.avatarIdentity = presentation.fingerprint;
  avatar.dataset.avatarInitials = presentation.initials;
  avatar.dataset.hasAvatar = hasImage ? "true" : "false";
  applyStableAvatarIdentityDataset(avatar, presentation);

  const fallback = document.createElement("span");
  fallback.className = AVATAR_FALLBACK_CLASS;
  fallback.textContent = presentation.initials;
  fallback.dataset.avatarFallback = "true";
  avatar.appendChild(fallback);

  if (hasImage) {
    const image = document.createElement("img");
    image.className = AVATAR_IMAGE_CLASS;
    image.src = profile.src;
    image.alt = "";
    image.width = 28;
    image.height = 28;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.draggable = false;
    image.setAttribute("aria-hidden", "true");
    image.dataset.avatarImage = "true";
    avatar.insertBefore(image, fallback);
  }

  wrap.insertBefore(avatar, author || wrap.firstChild);
  head.dataset.followupAvatarSource = profile?.source || "initials-fallback";
  head.dataset.followupAvatarAuthor = authorText;

  return avatar;
}

function syncHead(head = null, identityIndex = new Map(), availableProfiles = []) {
  const author = directAuthor(head);
  const authorText = text(author?.textContent || "");

  if (!authorText) {
    removeAvatar(head);
    return false;
  }

  const commentId = text(head.closest?.("[data-comment-id]")?.dataset?.commentId || "");
  const identity = resolveCommentIdentity(authorText, identityIndex, commentId);
  const profile = resolveCommentProfile(
    authorText,
    identityIndex,
    availableProfiles,
    commentId
  );
  const presentation = presentationForAuthor(profile, authorText, identity);
  const expectedSrc = text(profile?.src || "");

  const current = head.querySelector?.(`.${AVATAR_CLASS}`) || null;
  const currentImage = current?.querySelector?.(`.${AVATAR_IMAGE_CLASS}`) || null;
  const currentSrc = text(currentImage?.getAttribute?.("src") || "");

  if (
    current &&
    currentSrc === expectedSrc &&
    current.dataset.avatarIdentity === presentation.fingerprint &&
    head.dataset.followupAvatarAuthor === authorText
  ) {
    applyStableAvatarIdentityDataset(current, presentation);
    return true;
  }

  removeAvatar(head);
  return Boolean(createAvatar(head, profile, authorText, identity));
}

async function hydrate(modal = null) {
  const id = ticketId(modal);
  if (!id || !modal) return null;

  let state = modalState.get(modal) || null;
  if (state?.detail) return state.detail;
  if (state?.promise) return state.promise;

  state = {
    detail: null,
    promise: null,
    failed: false,
  };

  state.promise = Promise.resolve()
    .then(() => loadIncidenciaDetail(id))
    .then((value) => {
      const detail = unwrapDetail(value);
      state.detail = Object.keys(detail).length ? detail : null;
      state.failed = !state.detail;
      return state.detail;
    })
    .catch(() => {
      state.failed = true;
      state.detail = null;
      return null;
    })
    .finally(() => {
      state.promise = null;
    });

  modalState.set(modal, state);
  return state.promise;
}

function queueHydration(modal = null) {
  const state = modalState.get(modal) || null;

  if (!modal || state?.detail || state?.promise || state?.failed) {
    return false;
  }

  void hydrate(modal).then(() => {
    if (modal?.isConnected) syncModal(modal);
  });

  return true;
}

export function syncModal(modal = null) {
  if (!modal?.querySelectorAll) return 0;

  const heads = [...modal.querySelectorAll(COMMENT_HEAD_SELECTOR)];
  if (!heads.length) return 0;

  const state = modalState.get(modal) || null;

  if (!state?.detail) {
    queueHydration(modal);
    return 0;
  }

  const availableProfiles = profiles(modal, state.detail);
  const identityIndex = buildCommentIdentityIndex(state.detail);
  let synced = 0;

  for (const head of heads) {
    if (syncHead(head, identityIndex, availableProfiles)) synced += 1;
  }

  return synced;
}

export function syncIncidenciasFollowupAvatars(root = document) {
  if (!root?.querySelectorAll) return 0;

  const modals = [];
  if (root?.matches?.(MODAL_SELECTOR)) modals.push(root);

  for (const modal of root.querySelectorAll(MODAL_SELECTOR)) {
    if (!modals.includes(modal)) modals.push(modal);
  }

  return modals.reduce(
    (total, modal) => total + syncModal(modal),
    0
  );
}

function queueSync() {
  if (!isBrowser() || queued) return false;
  queued = true;

  Promise.resolve().then(() => {
    queued = false;
    syncIncidenciasFollowupAvatars(document);
  });

  return true;
}

function nodeTouchesFollowup(node = null) {
  if (!node || node.nodeType !== 1) return false;

  return Boolean(
    node.matches?.(MODAL_SELECTOR) ||
    node.matches?.(COMMENT_HEAD_SELECTOR) ||
    node.querySelector?.(MODAL_SELECTOR) ||
    node.querySelector?.(COMMENT_HEAD_SELECTOR)
  );
}

function installObserver() {
  if (!isBrowser() || observer || typeof MutationObserver !== "function") {
    return Boolean(observer);
  }

  const root = document.body || document.documentElement;
  if (!root) return false;

  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) =>
      mutation.type === "childList" &&
      (
        nodeTouchesFollowup(mutation.target) ||
        [...mutation.addedNodes].some(nodeTouchesFollowup)
      )
    );

    if (relevant) queueSync();
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
  });

  return true;
}

export function mountIncidenciasFollowupAvatars() {
  if (!isBrowser()) return false;

  if (window[MOUNT_KEY]?.mounted === true) {
    syncIncidenciasFollowupAvatars(document);
    installObserver();
    return true;
  }

  const syncedAtMount = syncIncidenciasFollowupAvatars(document);
  const observerActive = installObserver();

  window[MOUNT_KEY] = Object.freeze({
    mounted: true,
    version: INCIDENCIAS_FOLLOWUP_AVATARS_VERSION,
    syncedAtMount,
    observerActive,
    target: "Seguimiento",
    selector: COMMENT_HEAD_SELECTOR,
    identityFirst: true,
    avatarAuthority: "global",
    mountedAt: new Date().toISOString(),
  });

  return true;
}

mountIncidenciasFollowupAvatars();

export default Object.freeze({
  version: INCIDENCIAS_FOLLOWUP_AVATARS_VERSION,
  mount: mountIncidenciasFollowupAvatars,
  sync: syncIncidenciasFollowupAvatars,
});

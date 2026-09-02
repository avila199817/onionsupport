/* =========================================================
   Onion Support · Incidencias Comment Avatars

   VISUAL ADAPTER · GLOBAL AVATAR AUTHORITY

   Responsabilidad:
   - Decorar autores del timeline con la foto real del solicitante/técnico.
   - Hidratar identidad estable por modal mediante el coordinador de detalle.
   - Delegar iniciales, tone, image/fallback y errores a AvatarSystem.
   - No escuchar errores globales de imagen ni mantener paletas propias.
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
  requesterIdentity,
  resolveCommentProfile,
  technicianIdentity,
} from "../incidencias-comment-identity/index.js";

export const INCIDENCIAS_COMMENT_AVATARS_VERSION =
  "incidencias.comment-avatars.v1-global-avatar-authority";

const DETAIL_MODAL_SELECTOR = [
  "[data-incidencias-modal-root='true']",
  "#incidencias-detail-modal-root",
].join(",");

const COMMENT_META_SELECTOR =
  ".incidencias-timeline-card.is-comment .incidencias-timeline-meta";

const REQUESTER_PROFILE_SELECTOR =
  ".incidencias-modal-avatar[title]";

const TECHNICIAN_PROFILE_SELECTOR =
  "[data-modal-technician='true'][data-technician-assigned='true']";

const COMMENT_AVATAR_CLASS =
  "incidencias-timeline-comment-avatar";

const COMMENT_AVATAR_META_CLASS =
  "has-comment-avatar";

const MOUNT_KEY = "__ONION_INCIDENCIAS_COMMENT_AVATARS__";

const detailIdentityState = new WeakMap();
let observer = null;
let scanQueued = false;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function safeObject(value = null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function firstObject(...values) {
  for (const value of values) {
    const object = safeObject(value);
    if (object && Object.keys(object).length) return object;
  }
  return {};
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanImageSrc(image = null) {
  if (!image || image.hidden === true) return "";
  return cleanText(image.getAttribute?.("src") || "");
}

function unwrapDetail(value = null) {
  const root = safeObject(value) || {};
  return firstObject(
    root.detail,
    root.ticket,
    root.incidencia,
    root.item,
    root.data,
    root
  );
}

function ticketIdFromModal(modal = null) {
  return cleanText(modal?.dataset?.ticketId || "");
}

function profileFromRequester(modal = null, detail = {}) {
  const host = modal?.querySelector?.(REQUESTER_PROFILE_SELECTOR) || null;
  if (!host) return null;

  const name = cleanText(host.getAttribute("title") || "");
  const image = host.querySelector?.("[data-modal-avatar-img='true']") || null;
  const src = cleanImageSrc(image);

  if (!name) return null;

  return Object.freeze({
    name,
    src,
    source: "requester",
    ...requesterIdentity(detail),
  });
}

function profileFromTechnician(modal = null, detail = {}) {
  const host = modal?.querySelector?.(TECHNICIAN_PROFILE_SELECTOR) || null;
  if (!host) return null;

  const name = cleanText(
    host.querySelector?.(".incidencias-modal-technician-copy strong")?.textContent ||
      host.querySelector?.("strong")?.textContent ||
      ""
  );
  const image = host.querySelector?.("[data-modal-technician-avatar-img='true']") || null;
  const src = cleanImageSrc(image);

  if (!name) return null;

  return Object.freeze({
    name,
    src,
    source: "technician",
    ...technicianIdentity(detail),
  });
}

function availableProfiles(modal = null, detail = {}) {
  return [
    profileFromRequester(modal, detail),
    profileFromTechnician(modal, detail),
  ].filter(Boolean);
}

function directAuthorNode(meta = null) {
  if (!meta?.children) return null;
  return [...meta.children].find((node) => node?.tagName === "STRONG") || null;
}

function removeCommentAvatar(meta = null) {
  if (!meta) return false;

  const current = meta.querySelector?.(`.${COMMENT_AVATAR_CLASS}`) || null;
  current?.remove?.();
  meta.classList?.remove(COMMENT_AVATAR_META_CLASS);
  delete meta.dataset.commentAvatarSource;
  delete meta.dataset.commentAvatarAuthor;

  return Boolean(current);
}

function createCommentAvatar(meta = null, profile = null, author = "") {
  if (!meta || !profile?.src || !author) return null;

  const presentation = resolveAvatarPresentation({
    displayName: author,
    name: author,
    email: profile.email,
    userId: profile.userId,
  });

  const avatar = document.createElement("span");
  avatar.className = COMMENT_AVATAR_CLASS;
  avatar.setAttribute("aria-hidden", "true");
  avatar.dataset.commentAvatar = "true";
  avatar.dataset.commentAvatarSource = profile.source;
  avatar.dataset.commentAvatarAuthor = author;
  avatar.dataset.avatarSystem = "true";
  avatar.dataset.avatarHost = "true";
  avatar.dataset.avatarTone = String(presentation.tone);
  avatar.dataset.avatarIdentity = presentation.fingerprint;
  avatar.dataset.avatarInitials = presentation.initials;
  avatar.dataset.hasAvatar = "true";

  const image = document.createElement("img");
  image.src = profile.src;
  image.alt = "";
  image.width = 22;
  image.height = 22;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  image.dataset.avatarImage = "true";

  const fallback = document.createElement("span");
  fallback.textContent = presentation.initials;
  fallback.dataset.avatarFallback = "true";

  avatar.append(image, fallback);

  const authorNode = directAuthorNode(meta);
  meta.insertBefore(avatar, authorNode || meta.firstChild);
  meta.classList.add(COMMENT_AVATAR_META_CLASS);
  meta.dataset.commentAvatarSource = profile.source;
  meta.dataset.commentAvatarAuthor = author;

  return avatar;
}

function syncCommentMeta(meta = null, profiles = [], identityIndex = new Map()) {
  const authorNode = directAuthorNode(meta);
  const author = cleanText(authorNode?.textContent || "");

  if (!author) {
    removeCommentAvatar(meta);
    return false;
  }

  const profile = resolveCommentProfile(author, identityIndex, profiles);

  if (!profile?.src) {
    removeCommentAvatar(meta);
    return false;
  }

  const presentation = resolveAvatarPresentation({
    displayName: author,
    name: author,
    email: profile.email,
    userId: profile.userId,
  });

  const current = meta.querySelector?.(`.${COMMENT_AVATAR_CLASS}`) || null;
  const currentImage = current?.querySelector?.("[data-avatar-image='true']") || null;
  const currentSrc = cleanText(currentImage?.getAttribute?.("src") || "");

  if (
    current &&
    currentSrc === profile.src &&
    current.dataset.avatarIdentity === presentation.fingerprint &&
    meta.dataset.commentAvatarAuthor === author
  ) {
    meta.classList.add(COMMENT_AVATAR_META_CLASS);
    return true;
  }

  removeCommentAvatar(meta);
  return Boolean(createCommentAvatar(meta, profile, author));
}

function getModalIdentityState(modal = null) {
  if (!modal || typeof modal !== "object") return null;
  return detailIdentityState.get(modal) || null;
}

async function hydrateDetailIdentity(modal = null) {
  const ticketId = ticketIdFromModal(modal);
  if (!ticketId || !modal) return null;

  let state = getModalIdentityState(modal);
  if (state?.detail) return state.detail;
  if (state?.promise) return state.promise;

  state = {
    ticketId,
    detail: null,
    promise: null,
    failed: false,
  };

  state.promise = Promise.resolve()
    .then(() => loadIncidenciaDetail(ticketId))
    .then((result) => {
      const detail = unwrapDetail(result);
      state.detail = detail && Object.keys(detail).length ? detail : null;
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

  detailIdentityState.set(modal, state);
  return state.promise;
}

function queueIdentityHydration(modal = null) {
  const ticketId = ticketIdFromModal(modal);
  const state = getModalIdentityState(modal);

  if (!ticketId || state?.detail || state?.promise || state?.failed) return false;

  void hydrateDetailIdentity(modal).then(() => {
    if (modal?.isConnected) syncIncidenciasCommentAvatars(modal);
  });

  return true;
}

export function syncIncidenciasCommentAvatars(root = document) {
  if (!root?.querySelectorAll) return 0;

  const modals = [];
  if (root?.matches?.(DETAIL_MODAL_SELECTOR)) modals.push(root);

  for (const modal of root.querySelectorAll(DETAIL_MODAL_SELECTOR)) {
    if (!modals.includes(modal)) modals.push(modal);
  }

  let synced = 0;

  for (const modal of modals) {
    const state = getModalIdentityState(modal);
    const detail = state?.detail || {};
    const identityReady = Boolean(detail && Object.keys(detail).length);
    const identityFailed = state?.failed === true;

    if (!identityReady && !identityFailed) {
      for (const meta of modal.querySelectorAll(COMMENT_META_SELECTOR)) {
        removeCommentAvatar(meta);
      }
      queueIdentityHydration(modal);
      continue;
    }

    const profiles = availableProfiles(modal, detail);
    const identityIndex = identityReady
      ? buildCommentIdentityIndex(detail)
      : new Map();

    for (const meta of modal.querySelectorAll(COMMENT_META_SELECTOR)) {
      if (syncCommentMeta(meta, profiles, identityIndex)) synced += 1;
    }
  }

  return synced;
}

function queueScan() {
  if (!isBrowser() || scanQueued) return false;
  scanQueued = true;

  Promise.resolve().then(() => {
    scanQueued = false;
    syncIncidenciasCommentAvatars(document);
  });

  return true;
}

function nodeTouchesDetail(node = null) {
  if (!node || node.nodeType !== 1) return false;

  return Boolean(
    node.matches?.(DETAIL_MODAL_SELECTOR) ||
    node.matches?.(COMMENT_META_SELECTOR) ||
    node.matches?.(REQUESTER_PROFILE_SELECTOR) ||
    node.matches?.(TECHNICIAN_PROFILE_SELECTOR) ||
    node.querySelector?.(DETAIL_MODAL_SELECTOR) ||
    node.querySelector?.(COMMENT_META_SELECTOR) ||
    node.querySelector?.(REQUESTER_PROFILE_SELECTOR) ||
    node.querySelector?.(TECHNICIAN_PROFILE_SELECTOR)
  );
}

function installObserver() {
  if (!isBrowser() || observer || typeof MutationObserver !== "function") {
    return Boolean(observer);
  }

  const root = document.body || document.documentElement;
  if (!root) return false;

  observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      if (mutation?.type !== "childList") return false;
      if (nodeTouchesDetail(mutation.target)) return true;
      return [...mutation.addedNodes].some(nodeTouchesDetail);
    });

    if (relevant) queueScan();
  });

  observer.observe(root, {
    childList: true,
    subtree: true,
  });

  return true;
}

export function mountIncidenciasCommentAvatars() {
  if (!isBrowser()) return false;

  if (window[MOUNT_KEY]?.mounted === true) {
    syncIncidenciasCommentAvatars(document);
    installObserver();
    return true;
  }

  const syncedAtMount = syncIncidenciasCommentAvatars(document);
  const observerActive = installObserver();

  window[MOUNT_KEY] = Object.freeze({
    mounted: true,
    version: INCIDENCIAS_COMMENT_AVATARS_VERSION,
    syncedAtMount,
    observerActive,
    identityFirst: true,
    modalScopedIdentity: true,
    avatarAuthority: "global",
    mountedAt: new Date().toISOString(),
  });

  return true;
}

mountIncidenciasCommentAvatars();

export default Object.freeze({
  version: INCIDENCIAS_COMMENT_AVATARS_VERSION,
  mount: mountIncidenciasCommentAvatars,
  sync: syncIncidenciasCommentAvatars,
});

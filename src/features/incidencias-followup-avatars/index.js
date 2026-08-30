/* =========================================================
   Onion Support - Incidencias Follow-up Avatars

   Responsabilidad:
   - Pintar la foto real del autor en la sección "Seguimiento" del modal.
   - Actuar sobre las cards generadas por incidencias-detail-state.
   - Resolver identidad por userId/email y usar nombre sólo para legacy.
   - Reutilizar exclusivamente los avatares vivos ya renderizados en el modal.
   - Mantener presentación co-localizada en style.css, cargada con este feature.
   - No crear placeholders ni duplicar datos de perfil.
========================================================= */

"use strict";

import "./style.css";

import {
  loadIncidenciaDetail,
} from "../../views/incidencias/incidencias.api.js";

import {
  IncidenciasAvatarFallbackInternals,
} from "../incidencias-avatar-fallback/index.js";

export const INCIDENCIAS_FOLLOWUP_AVATARS_VERSION =
  "incidencias.followup-avatars.v2.premium-horizontal";

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

const MOUNT_KEY =
  "__ONION_INCIDENCIAS_FOLLOWUP_AVATARS__";

const modalState = new WeakMap();

let observer = null;
let queued = false;

const {
  requesterIdentity,
  technicianIdentity,
  buildCommentIdentityIndex,
  resolveCommentProfile,
} = IncidenciasAvatarFallbackInternals;

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

  const src = text(image.getAttribute?.("src") || "");
  if (!src) return "";

  const host = image.closest?.("[data-has-avatar]") || null;
  if (host?.dataset?.hasAvatar === "false") return "";

  if (
    image.complete === true &&
    Number(image.naturalWidth || 0) === 0
  ) {
    return "";
  }

  return src;
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
  const src = cleanImageSrc(image);

  if (!name || !src) return null;

  return Object.freeze({
    name,
    src,
    source: "requester",
    ...requesterIdentity(detail),
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
  const src = cleanImageSrc(image);

  if (!name || !src) return null;

  return Object.freeze({
    name,
    src,
    source: "technician",
    ...technicianIdentity(detail),
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

function createAvatar(head = null, profile = null, authorText = "") {
  const author = directAuthor(head);
  const wrap = ensureAuthorWrap(head, author);

  if (!wrap || !profile?.src) return null;

  const image = document.createElement("img");
  image.className = AVATAR_CLASS;
  image.src = profile.src;
  image.alt = "";
  image.width = 28;
  image.height = 28;
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  image.dataset.followupAvatar = "true";
  image.dataset.followupAvatarSource = profile.source;

  image.addEventListener(
    "error",
    () => {
      image.remove();
      delete head.dataset.followupAvatarSource;
      delete head.dataset.followupAvatarAuthor;
    },
    { once: true }
  );

  /*
    La foto es siempre el primer hijo del wrapper y el nombre el segundo.
    style.css convierte ese orden DOM en una cuadrícula horizontal robusta:
    avatar | nombre. La fecha permanece hermana independiente a la derecha.
  */
  wrap.insertBefore(image, author || wrap.firstChild);
  head.dataset.followupAvatarSource = profile.source;
  head.dataset.followupAvatarAuthor = authorText;

  return image;
}

function syncHead(head = null, identityIndex = new Map(), availableProfiles = []) {
  const author = directAuthor(head);
  const authorText = text(author?.textContent || "");

  if (!authorText) {
    removeAvatar(head);
    return false;
  }

  const profile = resolveCommentProfile(
    authorText,
    identityIndex,
    availableProfiles
  );

  if (!profile?.src) {
    removeAvatar(head);
    return false;
  }

  const current = head.querySelector?.(`.${AVATAR_CLASS}`) || null;
  const currentSrc = text(current?.getAttribute?.("src") || "");

  if (
    current &&
    currentSrc === profile.src &&
    head.dataset.followupAvatarAuthor === authorText
  ) {
    return true;
  }

  removeAvatar(head);
  createAvatar(head, profile, authorText);
  return true;
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
    for (const head of heads) removeAvatar(head);
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
    presentation: "css-colocated-premium-horizontal",
    mountedAt: new Date().toISOString(),
  });

  return true;
}

mountIncidenciasFollowupAvatars();

export const IncidenciasFollowupAvatarInternals = Object.freeze({
  ticketId,
  requesterProfile,
  technicianProfile,
  directAuthor,
  syncHead,
});

export default Object.freeze({
  version: INCIDENCIAS_FOLLOWUP_AVATARS_VERSION,
  mount: mountIncidenciasFollowupAvatars,
  sync: syncIncidenciasFollowupAvatars,
});

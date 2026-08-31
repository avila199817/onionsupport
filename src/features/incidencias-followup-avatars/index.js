/* =========================================================
   Onion Support - Incidencias Follow-up Avatars

   Responsabilidad:
   - Pintar el avatar de cada autor en la sección "Seguimiento" del modal.
   - Actuar sobre las cards generadas por incidencias-detail-state.
   - Resolver fotos por userId/email y usar nombre sólo para legacy.
   - Reutilizar el tono vivo del solicitante o técnico ya renderizado en el modal.
   - Completar cualquier autor sin foto con iniciales canónicas y tono determinista.
   - Mantener presentación co-localizada en style.css, cargada con este feature.
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
  "incidencias.followup-avatars.v5.identity-first-single-paint";

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

const REQUESTER_FRAME_SELECTOR =
  "[data-modal-avatar-frame='true']";

const TECHNICIAN_FRAME_SELECTOR =
  "[data-modal-technician-avatar-frame='true']";

const AUTHOR_WRAP_CLASS =
  "incidencias-modal-description-comment-author";

const AVATAR_CLASS =
  "incidencias-modal-description-comment-avatar";

const AVATAR_IMAGE_CLASS =
  "incidencias-modal-description-comment-avatar-image";

const AVATAR_FALLBACK_CLASS =
  "incidencias-modal-description-comment-avatar-fallback";

const CANONICAL_AVATAR_FRAME_CLASS =
  "ui-detail-modal-avatar-frame";

const CANONICAL_AVATAR_FALLBACK_CLASS =
  "ui-detail-modal-avatar-fallback";

const MOUNT_KEY =
  "__ONION_INCIDENCIAS_FOLLOWUP_AVATARS__";

const modalState = new WeakMap();

let observer = null;
let queued = false;

const {
  avatarInitials,
  avatarToneFromIdentity,
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

function resolveAvatarTone(host = null, fallbackIdentity = "") {
  const rawTone = text(host?.dataset?.avatarTone || "");
  const tone = Number.parseInt(rawTone, 10);

  return Number.isInteger(tone) && tone >= 0 && tone <= 9
    ? tone
    : avatarToneFromIdentity(fallbackIdentity);
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
  const frame = host?.querySelector?.(REQUESTER_FRAME_SELECTOR) || null;
  const image = host?.querySelector?.(REQUESTER_IMAGE_SELECTOR) || null;
  const name = text(host?.getAttribute?.("title") || "");
  const identity = requesterIdentity(detail);

  if (!name) return null;

  return Object.freeze({
    name,
    src: cleanImageSrc(image),
    source: "requester",
    tone: resolveAvatarTone(frame, identity.email || name),
    ...identity,
  });
}

function technicianProfile(modal = null, detail = {}) {
  const host = modal?.querySelector?.(TECHNICIAN_SELECTOR) || null;
  const frame = host?.querySelector?.(TECHNICIAN_FRAME_SELECTOR) || null;
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
    tone: resolveAvatarTone(frame, identity.email || name),
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

function setAvatarState(
  avatar = null,
  head = null,
  {
    hasAvatar = false,
    source = "initials-fallback",
  } = {}
) {
  if (!avatar || !head) return false;

  avatar.dataset.hasAvatar = hasAvatar ? "true" : "false";
  avatar.dataset.fallback = hasAvatar ? "false" : "true";
  avatar.dataset.followupAvatarSource = source;
  head.dataset.followupAvatarSource = source;

  return true;
}

function createAvatar(head = null, profile = null, authorText = "") {
  const author = directAuthor(head);
  const wrap = ensureAuthorWrap(head, author);

  if (!wrap || !authorText) return null;

  const tone = Number.isInteger(profile?.tone)
    ? profile.tone
    : avatarToneFromIdentity(profile?.email || profile?.name || authorText);

  const avatar = document.createElement("span");
  avatar.className =
    `${AVATAR_CLASS} ${CANONICAL_AVATAR_FRAME_CLASS}`;
  avatar.setAttribute("aria-hidden", "true");
  avatar.dataset.followupAvatar = "true";
  avatar.dataset.avatarTone = String(tone);

  const fallback = document.createElement("span");
  fallback.className =
    `${AVATAR_FALLBACK_CLASS} ${CANONICAL_AVATAR_FALLBACK_CLASS}`;
  fallback.textContent = avatarInitials(authorText);
  avatar.appendChild(fallback);

  const fallbackSource = profile?.source
    ? `${profile.source}-fallback`
    : "initials-fallback";

  setAvatarState(avatar, head, {
    hasAvatar: false,
    source: fallbackSource,
  });

  if (profile?.src) {
    const image = document.createElement("img");
    image.className = AVATAR_IMAGE_CLASS;
    image.alt = "";
    image.width = 28;
    image.height = 28;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.draggable = false;
    image.setAttribute("aria-hidden", "true");

    image.addEventListener(
      "load",
      () => {
        setAvatarState(avatar, head, {
          hasAvatar: true,
          source: profile.source,
        });
      },
      { once: true }
    );

    image.addEventListener(
      "error",
      () => {
        image.remove();
        setAvatarState(avatar, head, {
          hasAvatar: false,
          source: fallbackSource,
        });
      },
      { once: true }
    );

    image.src = profile.src;
    avatar.insertBefore(image, fallback);

    if (image.complete && Number(image.naturalWidth || 0) > 0) {
      setAvatarState(avatar, head, {
        hasAvatar: true,
        source: profile.source,
      });
    }
  }

  /*
    El avatar estable es siempre el primer hijo del wrapper y el nombre el segundo.
    La fecha permanece hermana independiente a la derecha. El fallback ya ocupa
    la geometría definitiva mientras una foto carga o si termina fallando.
  */
  wrap.insertBefore(avatar, author || wrap.firstChild);
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

  const profile = resolveCommentProfile(
    authorText,
    identityIndex,
    availableProfiles
  );

  const expectedSrc = text(profile?.src || "");
  const expectedTone = Number.isInteger(profile?.tone)
    ? profile.tone
    : avatarToneFromIdentity(profile?.email || profile?.name || authorText);

  const current = head.querySelector?.(`.${AVATAR_CLASS}`) || null;
  const currentImage = current?.querySelector?.(`.${AVATAR_IMAGE_CLASS}`) || null;
  const currentSrc = text(currentImage?.getAttribute?.("src") || "");

  if (
    current &&
    currentSrc === expectedSrc &&
    current.dataset.avatarTone === String(expectedTone) &&
    head.dataset.followupAvatarAuthor === authorText
  ) {
    return true;
  }

  removeAvatar(head);
  return Boolean(createAvatar(head, profile, authorText));
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
    /*
      Identity-first: no se monta un tono provisional basado sólo en el nombre.
      El detalle ya contiene la identidad estable; al resolverlo, syncModal se
      ejecuta de nuevo y crea cada fallback una única vez con su tono definitivo.
    */
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
    presentation: "shared-canonical-visual",
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
  resolveAvatarTone,
  createAvatar,
  syncHead,
});

export default Object.freeze({
  version: INCIDENCIAS_FOLLOWUP_AVATARS_VERSION,
  mount: mountIncidenciasFollowupAvatars,
  sync: syncIncidenciasFollowupAvatars,
});

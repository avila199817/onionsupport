/* =========================================================
   Onion Support - Incidencias Avatar Fallback

   Responsabilidad:
   - Evitar el icono de imagen rota en la tabla de Incidencias.
   - Si un avatar de solicitante o técnico falla, mostrar inmediatamente
     las iniciales ya renderizadas por la plantilla.
   - Cubrir tanto imágenes que fallaron antes de cargar esta mejora como
     errores futuros después de rerenders/infinite scroll.
   - En el modal de detalle, reutilizar las fotos reales ya renderizadas
     de solicitante/técnico junto al nombre de quien comenta.
   - Resolver el autor por userId/email cuando el comentario dispone de
     identidad estable; el nombre queda sólo como compatibilidad legacy.
   - Mantener la identidad hidratada ligada al nodo de modal actual para
     no reutilizar datos obsoletos tras cerrar/reabrir o reasignar técnico.
   - No crear tarjetas, badges ni decoraciones nuevas alrededor del autor.
========================================================= */

"use strict";

import {
  loadIncidenciaDetail,
} from "../../views/incidencias/incidencias.api.js";

export const INCIDENCIAS_AVATAR_FALLBACK_VERSION =
  "incidencias.avatar-fallback.v4.comment-identity-modal-scope";

const IMAGE_SELECTOR = [
  ".incidencias-avatar-img",
  ".incidencias-assigned-avatar img",
].join(",");

const HOST_SELECTOR =
  ".incidencias-avatar, .incidencias-assigned-avatar";

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

const COMMENT_AVATAR_STYLE_ID =
  "onion-incidencias-comment-avatar-style";

const MOUNT_KEY = "__ONION_INCIDENCIAS_AVATAR_FALLBACK__";

let commentObserver = null;
let commentScanQueued = false;

/*
   Estado por nodo de modal, no por ticketId.
   Al desaparecer el modal, WeakMap permite liberar el detalle hidratado.
   Una reapertura obtiene de nuevo el detalle mediante el coordinador
   canónico (single-flight + cache TTL), evitando identidades eternamente
   obsoletas en una SPA de larga duración.
*/
const detailIdentityState = new WeakMap();

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function safeObject(value = null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function safeArray(value = null) {
  return Array.isArray(value) ? value : [];
}

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstText(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;

    if (typeof value === "string" || typeof value === "number") {
      const text = cleanText(value);
      if (text) return text;
    }
  }

  return "";
}

function firstObject(...values) {
  for (const value of values) {
    const object = safeObject(value);
    if (object && Object.keys(object).length) return object;
  }

  return {};
}

function avatarInitials(value = "") {
  return (
    cleanText(value)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("")
      .slice(0, 2) ||
    "ON"
  );
}

function avatarToneFromIdentity(value = "") {
  const identity = cleanText(value);
  let hash = 0;

  for (let index = 0; index < identity.length; index += 1) {
    hash = ((hash << 5) - hash) + identity.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash) % 10;
}

function normalizePersonName(value = "") {
  return cleanText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUserId(value = "") {
  return cleanText(value).toLowerCase();
}

function normalizeEmail(value = "") {
  const email = cleanText(value).toLowerCase();
  return email.includes("@") ? email : "";
}

function samePerson(left = "", right = "") {
  const a = normalizePersonName(left);
  const b = normalizePersonName(right);

  if (!a || !b) return false;
  if (a === b) return true;

  return (
    a.length >= 5 &&
    b.length >= 5 &&
    (a.includes(b) || b.includes(a))
  );
}

function cleanImageSrc(image = null) {
  if (!image || image.hidden === true) return "";

  const src = cleanText(image.getAttribute?.("src") || "");
  if (!src) return "";

  const host = image.closest?.("[data-has-avatar]") || null;
  if (host?.dataset?.hasAvatar === "false") return "";

  return src;
}

function isManagedImage(node = null) {
  return Boolean(
    node?.nodeType === 1 &&
    typeof node.matches === "function" &&
    node.matches(IMAGE_SELECTOR)
  );
}

function markFallback(image = null, reason = "load-error") {
  if (!isManagedImage(image)) return false;

  const host = image.closest?.(HOST_SELECTOR) || null;
  if (!host) return false;

  try {
    host.classList.remove("has-image");
    host.classList.add("is-fallback");
    host.dataset.hasAvatar = "false";
    host.dataset.avatarFallback = "true";
    host.dataset.avatarFallbackReason = reason;
    host.dataset.avatarFallbackVersion = INCIDENCIAS_AVATAR_FALLBACK_VERSION;

    image.hidden = true;
    image.setAttribute("aria-hidden", "true");
    image.dataset.avatarFailed = "true";
    image.dataset.avatarFallbackReason = reason;
    image.style.display = "none";
    image.removeAttribute("src");

    return true;
  } catch {
    return false;
  }
}

function scanBrokenImages(root = document) {
  if (!root?.querySelectorAll) return 0;

  let repaired = 0;

  for (const image of root.querySelectorAll(IMAGE_SELECTOR)) {
    if (
      image?.complete === true &&
      Number(image?.naturalWidth || 0) === 0
    ) {
      if (markFallback(image, "already-broken")) repaired += 1;
    }
  }

  return repaired;
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

function requesterIdentity(detail = {}) {
  const raw = safeObject(detail?.raw) || {};
  const requester = firstObject(
    detail.requesterSnapshot,
    detail.cliente,
    detail.receptor,
    detail.user,
    raw.requesterSnapshot,
    raw.cliente,
    raw.receptor,
    raw.user
  );

  return Object.freeze({
    userId: normalizeUserId(firstText(
      detail.userId,
      detail.usuarioId,
      detail.ownerUserId,
      detail.createdByUserId,
      detail.receptorUserId,
      requester.userId,
      requester.id,
      raw.userId,
      raw.usuarioId,
      raw.ownerUserId,
      raw.createdByUserId,
      raw.receptorUserId
    )),
    email: normalizeEmail(firstText(
      detail.email,
      detail.emailLower,
      detail.userEmail,
      detail.clienteEmail,
      requester.email,
      requester.emailLower,
      raw.email,
      raw.emailLower,
      raw.userEmail
    )),
  });
}

function technicianIdentity(detail = {}) {
  const raw = safeObject(detail?.raw) || {};
  const assignment = firstObject(detail.assignment, raw.assignment);
  const technician = firstObject(
    assignment.technician,
    detail.tecnico,
    detail.assignedTo,
    detail.technician,
    raw.tecnico,
    raw.assignedTo,
    raw.technician
  );

  return Object.freeze({
    userId: normalizeUserId(firstText(
      detail.assignedToUserId,
      detail.technicianUserId,
      detail.tecnicoUserId,
      assignment.assignedToUserId,
      assignment.userId,
      assignment.technician?.userId,
      assignment.technician?.id,
      technician.userId,
      technician.id,
      raw.assignedToUserId,
      raw.technicianUserId,
      raw.tecnicoUserId
    )),
    email: normalizeEmail(firstText(
      detail.assignedToEmail,
      detail.technicianEmail,
      detail.tecnicoEmail,
      assignment.assignedToEmail,
      assignment.email,
      assignment.technician?.email,
      technician.email,
      technician.emailLower,
      raw.assignedToEmail,
      raw.technicianEmail,
      raw.tecnicoEmail
    )),
  });
}

function profileFromRequester(modal = null, detail = {}) {
  const host = modal?.querySelector?.(REQUESTER_PROFILE_SELECTOR) || null;
  if (!host) return null;

  const name = cleanText(host.getAttribute("title") || "");
  const image = host.querySelector?.("[data-modal-avatar-img='true']") || null;
  const src = cleanImageSrc(image);

  if (!name || !src) return null;

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

  const image =
    host.querySelector?.("[data-modal-technician-avatar-img='true']") || null;
  const src = cleanImageSrc(image);

  if (!name || !src) return null;

  return Object.freeze({
    name,
    src,
    source: "technician",
    ...technicianIdentity(detail),
  });
}

function commentProfiles(modal = null, detail = {}) {
  return [
    profileFromRequester(modal, detail),
    profileFromTechnician(modal, detail),
  ].filter(Boolean);
}

function commentEntries(detail = {}) {
  const raw = safeObject(detail?.raw) || {};
  const entries = [];

  for (const value of [
    ...safeArray(detail.comments),
    ...safeArray(detail.notes),
    ...safeArray(detail.messages),
    ...safeArray(raw.comments),
    ...safeArray(raw.notes),
    ...safeArray(raw.messages),
  ]) {
    const entry = safeObject(value);
    if (entry) entries.push(entry);
  }

  for (const value of [
    ...safeArray(detail.timeline),
    ...safeArray(raw.timeline),
  ]) {
    const entry = safeObject(value);
    if (!entry) continue;

    const kind = cleanText(
      firstText(entry.kind, entry.type, entry.action, entry.event)
    ).toLowerCase();

    if (["comment", "comentario"].includes(kind)) {
      entries.push(entry);
    }
  }

  return entries;
}

function stableCommentIdentity(entry = {}) {
  const byObject = safeObject(entry.by) || {};
  const createdBy = safeObject(entry.createdBy) || {};
  const updatedBy = safeObject(entry.updatedBy) || {};

  return Object.freeze({
    name: firstText(
      entry.author,
      entry.byName,
      entry.createdByName,
      entry.userName,
      entry.name,
      byObject.name,
      createdBy.name,
      updatedBy.name
    ),
    userId: normalizeUserId(firstText(
      entry.byUserId,
      typeof entry.by === "string" || typeof entry.by === "number"
        ? entry.by
        : "",
      entry.authorUserId,
      entry.createdByUserId,
      entry.userId,
      byObject.userId,
      byObject.id,
      createdBy.userId,
      createdBy.id,
      updatedBy.userId,
      updatedBy.id
    )),
    email: normalizeEmail(firstText(
      entry.byEmail,
      entry.authorEmail,
      entry.createdByEmail,
      entry.email,
      byObject.email,
      createdBy.email,
      updatedBy.email
    )),
  });
}

function buildCommentIdentityIndex(detail = {}) {
  const aggregate = new Map();

  for (const entry of commentEntries(detail)) {
    const identity = stableCommentIdentity(entry);
    const key = normalizePersonName(identity.name);
    if (!key) continue;

    const bucket = aggregate.get(key) || {
      userIds: new Set(),
      emails: new Set(),
    };

    if (identity.userId) bucket.userIds.add(identity.userId);
    if (identity.email) bucket.emails.add(identity.email);
    aggregate.set(key, bucket);
  }

  const index = new Map();

  for (const [key, bucket] of aggregate) {
    const userIds = [...bucket.userIds];
    const emails = [...bucket.emails];

    index.set(key, Object.freeze({
      userId: userIds.length === 1 ? userIds[0] : "",
      email: emails.length === 1 ? emails[0] : "",
      ambiguous:
        userIds.length > 1 ||
        emails.length > 1,
      hasStableIdentity:
        userIds.length > 0 ||
        emails.length > 0,
    }));
  }

  return index;
}

function directAuthorNode(meta = null) {
  if (!meta?.children) return null;

  return [...meta.children].find(
    (node) => node?.tagName === "STRONG"
  ) || null;
}

function matchProfileByStableIdentity(identity = null, profiles = []) {
  if (!identity || identity.ambiguous) return null;

  if (identity.userId) {
    const byUserId = profiles.filter(
      (profile) =>
        profile?.userId &&
        profile.userId === identity.userId
    );

    if (byUserId.length === 1) return byUserId[0];
  }

  if (identity.email) {
    const byEmail = profiles.filter(
      (profile) =>
        profile?.email &&
        profile.email === identity.email
    );

    if (byEmail.length === 1) return byEmail[0];
  }

  return null;
}

function resolveCommentProfile(author = "", identityIndex = new Map(), profiles = []) {
  const key = normalizePersonName(author);
  if (!key) return null;

  const stableIdentity = identityIndex.get(key) || null;

  if (stableIdentity?.hasStableIdentity) {
    /*
      Fail closed: cuando backend conoce la identidad, un nombre parecido
      nunca puede sobrescribir un userId/email que no coincide.
    */
    return matchProfileByStableIdentity(stableIdentity, profiles);
  }

  const exact = profiles.filter(
    (profile) => normalizePersonName(profile?.name) === key
  );

  if (exact.length === 1) return exact[0];

  const legacy = profiles.filter(
    (profile) => samePerson(author, profile?.name)
  );

  return legacy.length === 1 ? legacy[0] : null;
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

function installCommentAvatarStyles() {
  if (!isBrowser()) return false;
  if (document.getElementById(COMMENT_AVATAR_STYLE_ID)) return true;

  const style = document.createElement("style");
  style.id = COMMENT_AVATAR_STYLE_ID;
  style.textContent = `
    .incidencias-timeline-meta.${COMMENT_AVATAR_META_CLASS} {
      grid-template-columns: 22px minmax(0, auto);
      grid-template-rows: auto auto;
      align-items: center;
      justify-content: end;
      justify-items: end;
      column-gap: 7px;
      row-gap: 2px;
    }

    .incidencias-timeline-meta.${COMMENT_AVATAR_META_CLASS} > .${COMMENT_AVATAR_CLASS} {
      grid-column: 1;
      grid-row: 1 / span 2;
      inline-size: 22px;
      block-size: 22px;
      display: block;
      align-self: center;
      justify-self: end;
      object-fit: cover;
      border: 0;
      border-radius: 50%;
      background: transparent;
      box-shadow: none;
    }

    .incidencias-timeline-meta.${COMMENT_AVATAR_META_CLASS} > strong {
      grid-column: 2;
      grid-row: 1;
    }

    .incidencias-timeline-meta.${COMMENT_AVATAR_META_CLASS} > span:not(.${COMMENT_AVATAR_CLASS}) {
      grid-column: 2;
      grid-row: 2;
    }

    @media (max-width: 720px) {
      .incidencias-timeline-meta.${COMMENT_AVATAR_META_CLASS} {
        justify-content: start;
        justify-items: start;
        text-align: start;
      }

      .incidencias-timeline-meta.${COMMENT_AVATAR_META_CLASS} > .${COMMENT_AVATAR_CLASS} {
        justify-self: start;
      }
    }
  `;

  document.head?.appendChild(style);
  return true;
}

function createCommentAvatar(meta = null, profile = null, author = "") {
  if (!meta || !profile?.src) return null;

  const image = document.createElement("img");
  image.className = COMMENT_AVATAR_CLASS;
  image.src = profile.src;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.draggable = false;
  image.setAttribute("aria-hidden", "true");
  image.dataset.commentAvatar = "true";
  image.dataset.commentAvatarSource = profile.source;
  image.dataset.commentAvatarAuthor = author;

  image.addEventListener(
    "error",
    () => {
      image.remove();
      meta.classList.remove(COMMENT_AVATAR_META_CLASS);
      delete meta.dataset.commentAvatarSource;
      delete meta.dataset.commentAvatarAuthor;
    },
    { once: true }
  );

  const authorNode = directAuthorNode(meta);
  meta.insertBefore(image, authorNode || meta.firstChild);
  meta.classList.add(COMMENT_AVATAR_META_CLASS);
  meta.dataset.commentAvatarSource = profile.source;
  meta.dataset.commentAvatarAuthor = author;

  return image;
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

  const current = meta.querySelector?.(`.${COMMENT_AVATAR_CLASS}`) || null;
  const currentSrc = cleanText(current?.getAttribute?.("src") || "");

  if (
    current &&
    currentSrc === profile.src &&
    meta.dataset.commentAvatarAuthor === author
  ) {
    meta.classList.add(COMMENT_AVATAR_META_CLASS);
    return true;
  }

  removeCommentAvatar(meta);
  createCommentAvatar(meta, profile, author);
  return true;
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

  const flight = Promise.resolve()
    .then(() => loadIncidenciaDetail(ticketId))
    .then((result) => {
      const detail = unwrapDetail(result);

      if (detail && Object.keys(detail).length) {
        state.detail = detail;
        state.failed = false;
      } else {
        state.failed = true;
      }

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

  state.promise = flight;
  detailIdentityState.set(modal, state);

  return flight;
}

function queueIdentityHydration(modal = null) {
  const ticketId = ticketIdFromModal(modal);
  const state = getModalIdentityState(modal);

  if (
    !ticketId ||
    state?.detail ||
    state?.promise
  ) {
    return false;
  }

  void hydrateDetailIdentity(modal).then(() => {
    if (modal?.isConnected) {
      syncIncidenciasCommentAvatars(modal);
    }
  });

  return true;
}

export function syncIncidenciasCommentAvatars(root = document) {
  if (!root?.querySelectorAll) return 0;

  installCommentAvatarStyles();

  const modals = [];

  if (root?.matches?.(DETAIL_MODAL_SELECTOR)) {
    modals.push(root);
  }

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

    const profiles = commentProfiles(modal, detail);
    const identityIndex = identityReady
      ? buildCommentIdentityIndex(detail)
      : new Map();

    for (const meta of modal.querySelectorAll(COMMENT_META_SELECTOR)) {
      if (syncCommentMeta(meta, profiles, identityIndex)) synced += 1;
    }
  }

  return synced;
}

function queueCommentAvatarScan() {
  if (!isBrowser() || commentScanQueued) return false;

  commentScanQueued = true;

  Promise.resolve().then(() => {
    commentScanQueued = false;
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

function installCommentAvatarObserver() {
  if (!isBrowser() || commentObserver || typeof MutationObserver !== "function") {
    return Boolean(commentObserver);
  }

  const root = document.body || document.documentElement;
  if (!root) return false;

  commentObserver = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      if (mutation?.type !== "childList") return false;
      if (nodeTouchesDetail(mutation.target)) return true;
      return [...mutation.addedNodes].some(nodeTouchesDetail);
    });

    if (relevant) queueCommentAvatarScan();
  });

  commentObserver.observe(root, {
    childList: true,
    subtree: true,
  });

  return true;
}

function onImageError(event) {
  const image = event?.target || null;
  if (!isManagedImage(image)) return;
  markFallback(image, "load-error");
  queueCommentAvatarScan();
}

export function mountIncidenciasAvatarFallback() {
  if (!isBrowser()) return false;

  if (window[MOUNT_KEY]?.mounted === true) {
    scanBrokenImages(document);
    syncIncidenciasCommentAvatars(document);
    installCommentAvatarObserver();
    return true;
  }

  document.addEventListener("error", onImageError, true);

  const repairedAtMount = scanBrokenImages(document);
  const commentAvatarsAtMount = syncIncidenciasCommentAvatars(document);
  const commentObserverActive = installCommentAvatarObserver();

  window[MOUNT_KEY] = Object.freeze({
    mounted: true,
    version: INCIDENCIAS_AVATAR_FALLBACK_VERSION,
    repairedAtMount,
    commentAvatarsAtMount,
    commentObserverActive,
    identityFirst: true,
    modalScopedIdentity: true,
    mountedAt: new Date().toISOString(),
  });

  return true;
}

mountIncidenciasAvatarFallback();

export const IncidenciasAvatarFallbackInternals = Object.freeze({
  avatarInitials,
  avatarToneFromIdentity,
  normalizePersonName,
  normalizeUserId,
  normalizeEmail,
  requesterIdentity,
  technicianIdentity,
  stableCommentIdentity,
  buildCommentIdentityIndex,
  matchProfileByStableIdentity,
  resolveCommentProfile,
  getModalIdentityState,
});

export default Object.freeze({
  version: INCIDENCIAS_AVATAR_FALLBACK_VERSION,
  mount: mountIncidenciasAvatarFallback,
  syncCommentAvatars: syncIncidenciasCommentAvatars,
});

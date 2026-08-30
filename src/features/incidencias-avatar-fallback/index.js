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
   - No crear tarjetas, badges ni decoraciones nuevas alrededor del autor.
========================================================= */

export const INCIDENCIAS_AVATAR_FALLBACK_VERSION =
  "incidencias.avatar-fallback.v2.comment-authors";

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

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function normalizePersonName(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

  const src = String(image.getAttribute?.("src") || "").trim();
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

function profileFromRequester(modal = null) {
  const host = modal?.querySelector?.(REQUESTER_PROFILE_SELECTOR) || null;
  if (!host) return null;

  const name = String(host.getAttribute("title") || "").trim();
  const image = host.querySelector?.("[data-modal-avatar-img='true']") || null;
  const src = cleanImageSrc(image);

  if (!name || !src) return null;

  return Object.freeze({
    name,
    src,
    source: "requester",
  });
}

function profileFromTechnician(modal = null) {
  const host = modal?.querySelector?.(TECHNICIAN_PROFILE_SELECTOR) || null;
  if (!host) return null;

  const name = String(
    host.querySelector?.(".incidencias-modal-technician-copy strong")?.textContent ||
      host.querySelector?.("strong")?.textContent ||
      ""
  ).trim();

  const image =
    host.querySelector?.("[data-modal-technician-avatar-img='true']") || null;
  const src = cleanImageSrc(image);

  if (!name || !src) return null;

  return Object.freeze({
    name,
    src,
    source: "technician",
  });
}

function commentProfiles(modal = null) {
  return [
    profileFromRequester(modal),
    profileFromTechnician(modal),
  ].filter(Boolean);
}

function directAuthorNode(meta = null) {
  if (!meta?.children) return null;

  return [...meta.children].find(
    (node) => node?.tagName === "STRONG"
  ) || null;
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

function syncCommentMeta(meta = null, profiles = []) {
  const authorNode = directAuthorNode(meta);
  const author = String(authorNode?.textContent || "").trim();

  if (!author) {
    removeCommentAvatar(meta);
    return false;
  }

  const profile = profiles.find((candidate) =>
    samePerson(author, candidate?.name)
  ) || null;

  if (!profile?.src) {
    removeCommentAvatar(meta);
    return false;
  }

  const current = meta.querySelector?.(`.${COMMENT_AVATAR_CLASS}`) || null;
  const currentSrc = String(current?.getAttribute?.("src") || "").trim();

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
    const profiles = commentProfiles(modal);

    for (const meta of modal.querySelectorAll(COMMENT_META_SELECTOR)) {
      if (syncCommentMeta(meta, profiles)) synced += 1;
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
    mountedAt: new Date().toISOString(),
  });

  return true;
}

mountIncidenciasAvatarFallback();

export default Object.freeze({
  version: INCIDENCIAS_AVATAR_FALLBACK_VERSION,
  mount: mountIncidenciasAvatarFallback,
  syncCommentAvatars: syncIncidenciasCommentAvatars,
});

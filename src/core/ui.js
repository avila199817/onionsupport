/* =========================================================
   Onion SPA - Core UI
   Archivo: src/core/ui.js

   Responsabilidades:
   - helpers UI globales del core
   - sincronizar título documento
   - limpiar contenedores dinámicos shell
   - sincronizar bloque visual usuario
   - refresco reactivo con i18n
   - pintar avatar robusto en sidebar sin romper fallback

   FIX CRÍTICO:
   - no destruir la estructura DOM del avatar del sidebar
   - respetar #sidebarAvatarImage y #sidebarAvatarFallback
   - evitar innerHTML/textContent sobre el root del avatar
========================================================= */

import { config } from "./config.js";

import {
  getUserDisplayName,
  getUserUsername,
  getUserAvatarUrl,
  getInitials,
} from "./helpers.js";

import { I18n } from "../i18n/index.js";

/* =========================================================
   DOCUMENT TITLE
========================================================= */
export function setDocumentTitle({
  dom,
  events,
  title = config.appName,
  titleKey = "",
  titleParams = {},
}) {
  if (typeof document === "undefined") {
    return;
  }

  let finalTitle = title;

  if (titleKey) {
    finalTitle =
      I18n.t(
        titleKey,
        titleParams,
        title
      ) || title;
  }

  finalTitle = String(
    finalTitle ||
      config.appName
  );

  document.title =
    finalTitle;

  if (
    dom?.topbarTitle
  ) {
    dom.topbarTitle.textContent =
      finalTitle;
  }

  events?.emit?.(
    "app:title:change",
    {
      title:
        finalTitle,
    }
  );
}

/* =========================================================
   CLEAR DYNAMIC CONTAINERS
========================================================= */
export function clearDynamicContainers({
  dom,
  events,
}) {
  if (
    dom?.topbarViewContainer
  ) {
    dom.topbarViewContainer.innerHTML =
      "";
  }

  if (
    dom?.tableheadContainer
  ) {
    dom.tableheadContainer.innerHTML =
      "";
  }

  events?.emit?.(
    "app:dynamic:cleared",
    {}
  );
}

/* =========================================================
   INTERNAL AVATAR HELPERS
========================================================= */
function getAvatarNodes(
  avatarRoot
) {
  if (!avatarRoot) {
    return {
      imgEl: null,
      fallbackEl: null,
    };
  }

  const imgEl =
    avatarRoot.querySelector(
      "#sidebarAvatarImage, .avatar-image, img[data-avatar-image='true']"
    ) || null;

  const fallbackEl =
    avatarRoot.querySelector(
      "#sidebarAvatarFallback, .avatar-fallback, [data-avatar-fallback='true']"
    ) || null;

  return {
    imgEl,
    fallbackEl,
  };
}

function ensureAvatarImageNode(
  avatarRoot
) {
  if (!avatarRoot) return null;

  const {
    imgEl,
  } = getAvatarNodes(
    avatarRoot
  );

  if (imgEl) {
    imgEl.dataset.avatarImage =
      "true";
    return imgEl;
  }

  const created =
    document.createElement(
      "img"
    );

  created.dataset.avatarImage =
    "true";
  created.className =
    "avatar-image";
  created.loading = "eager";
  created.decoding = "async";
  created.draggable = false;
  created.referrerPolicy =
    "no-referrer";
  created.hidden = true;

  created.style.width =
    "100%";
  created.style.height =
    "100%";
  created.style.objectFit =
    "cover";
  created.style.borderRadius =
    "50%";
  created.style.display =
    "block";

  avatarRoot.appendChild(
    created
  );

  return created;
}

function ensureAvatarFallbackNode(
  avatarRoot,
  avatarText = "ON"
) {
  if (!avatarRoot) return null;

  const {
    fallbackEl,
  } = getAvatarNodes(
    avatarRoot
  );

  if (fallbackEl) {
    fallbackEl.dataset.avatarFallback =
      "true";
    if (
      !fallbackEl.textContent?.trim()
    ) {
      fallbackEl.textContent =
        avatarText;
    }
    return fallbackEl;
  }

  const created =
    document.createElement(
      "span"
    );

  created.className =
    "avatar-fallback";
  created.dataset.avatarFallback =
    "true";
  created.setAttribute(
    "aria-hidden",
    "true"
  );
  created.textContent =
    avatarText;

  avatarRoot.appendChild(
    created
  );

  return created;
}

function setAvatarRootMeta(
  avatarRoot,
  avatarAlt,
  displayName
) {
  if (!avatarRoot) return;

  avatarRoot.setAttribute(
    "aria-label",
    avatarAlt
  );

  avatarRoot.setAttribute(
    "title",
    displayName
  );

  avatarRoot.removeAttribute(
    "data-tooltip"
  );
}

function renderAvatarFallback(
  avatarRoot,
  avatarText,
  avatarAlt,
  displayName
) {
  if (!avatarRoot) return;

  const imgEl =
    ensureAvatarImageNode(
      avatarRoot
    );

  const fallbackEl =
    ensureAvatarFallbackNode(
      avatarRoot,
      avatarText
    );

  if (imgEl) {
    imgEl.hidden = true;
    imgEl.removeAttribute("src");
    imgEl.alt = avatarAlt;
  }

  if (fallbackEl) {
    fallbackEl.hidden = false;
    fallbackEl.textContent =
      avatarText;
  }

  avatarRoot.classList.remove(
    "has-image"
  );

  setAvatarRootMeta(
    avatarRoot,
    avatarAlt,
    displayName
  );
}

function renderAvatarImage(
  avatarRoot,
  avatarUrl,
  avatarAlt,
  displayName,
  avatarText
) {
  if (!avatarRoot) return;

  const safeUrl = String(
    avatarUrl || ""
  ).trim();

  if (!safeUrl) {
    renderAvatarFallback(
      avatarRoot,
      avatarText,
      avatarAlt,
      displayName
    );
    return;
  }

  const imgEl =
    ensureAvatarImageNode(
      avatarRoot
    );

  const fallbackEl =
    ensureAvatarFallbackNode(
      avatarRoot,
      avatarText
    );

  if (!imgEl) {
    renderAvatarFallback(
      avatarRoot,
      avatarText,
      avatarAlt,
      displayName
    );
    return;
  }

  imgEl.dataset.avatarImage =
    "true";
  imgEl.loading = "eager";
  imgEl.decoding = "async";
  imgEl.draggable = false;
  imgEl.referrerPolicy =
    "no-referrer";
  imgEl.alt = avatarAlt;

  imgEl.onerror = () => {
    renderAvatarFallback(
      avatarRoot,
      avatarText,
      avatarAlt,
      displayName
    );
  };

  imgEl.src = safeUrl;
  imgEl.hidden = false;

  if (fallbackEl) {
    fallbackEl.hidden = true;
    fallbackEl.textContent =
      avatarText;
  }

  avatarRoot.classList.add(
    "has-image"
  );

  setAvatarRootMeta(
    avatarRoot,
    avatarAlt,
    displayName
  );
}

/* =========================================================
   USER UI
========================================================= */
export function syncUserUI({
  state,
  dom,
  events,
}) {
  const user =
    state?.user ?? null;

  const displayName =
    getUserDisplayName(
      user
    ) || "Usuario";

  const username =
    getUserUsername(
      user
    ) || "";

  const avatarUrl =
    getUserAvatarUrl(
      user
    );

  const avatarText =
    getInitials(
      displayName
    ) ||
    (username
      ? username
          .slice(0, 2)
          .toUpperCase()
      : "ON");

  const avatarAlt = `${
    I18n.t(
      "common.user",
      {},
      "User"
    )
  } ${displayName}`;

  /* =====================
     SIDEBAR NAME
  ===================== */
  if (
    dom?.sidebarName
  ) {
    dom.sidebarName.textContent =
      displayName;

    if (username) {
      dom.sidebarName.dataset.username =
        username;
    } else {
      delete dom
        .sidebarName
        .dataset
        .username;
    }

    dom.sidebarName.removeAttribute(
      "data-tooltip"
    );
    dom.sidebarName.removeAttribute(
      "title"
    );
  }

  /* =====================
     SIDEBAR AVATAR
  ===================== */
  if (
    dom?.sidebarAvatar
  ) {
    if (!avatarUrl) {
      renderAvatarFallback(
        dom.sidebarAvatar,
        avatarText,
        avatarAlt,
        displayName
      );
    } else {
      renderAvatarImage(
        dom.sidebarAvatar,
        avatarUrl,
        avatarAlt,
        displayName,
        avatarText
      );
    }

    if (username) {
      dom.sidebarAvatar.dataset.username =
        username;
    } else {
      delete dom
        .sidebarAvatar
        .dataset
        .username;
    }
  }

  events?.emit?.(
    "app:user-ui:sync",
    {
      displayName,
      username:
        username ||
        null,
      avatarText,
      avatarUrl:
        avatarUrl ||
        null,
    }
  );
}

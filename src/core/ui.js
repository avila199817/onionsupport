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
function removeAvatarImage(
  avatarRoot
) {
  if (!avatarRoot) return;

  const oldImg =
    avatarRoot.querySelector(
      'img[data-avatar-image="true"]'
    );

  oldImg?.remove();
}

function renderAvatarFallback(
  avatarRoot,
  avatarText,
  avatarAlt,
  displayName
) {
  if (!avatarRoot) return;

  removeAvatarImage(
    avatarRoot
  );

  avatarRoot.textContent =
    avatarText;

  avatarRoot.classList.remove(
    "has-image"
  );

  avatarRoot.setAttribute(
    "aria-label",
    avatarAlt
  );

  avatarRoot.setAttribute(
    "title",
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

  let img =
    avatarRoot.querySelector(
      'img[data-avatar-image="true"]'
    );

  if (!img) {
    img =
      document.createElement(
        "img"
      );

    img.dataset.avatarImage =
      "true";

    img.loading = "eager";
    img.decoding = "async";
    img.draggable = false;
    img.referrerPolicy =
      "no-referrer";

    img.style.width =
      "100%";
    img.style.height =
      "100%";
    img.style.objectFit =
      "cover";
    img.style.borderRadius =
      "50%";
    img.style.display =
      "block";

    img.onerror = () => {
      renderAvatarFallback(
        avatarRoot,
        avatarText,
        avatarAlt,
        displayName
      );
    };

    avatarRoot.innerHTML =
      "";
    avatarRoot.appendChild(
      img
    );
  }

  img.src = safeUrl;
  img.alt = avatarAlt;

  avatarRoot.classList.add(
    "has-image"
  );

  avatarRoot.setAttribute(
    "aria-label",
    avatarAlt
  );

  avatarRoot.setAttribute(
    "title",
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
    state?.user ??
    null;

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

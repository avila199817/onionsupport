/* =========================================================
   Onion SPA - Core UI
   Archivo: src/core/ui.js

   Responsabilidades:
   - helpers UI globales del core
   - sincronizar título documento
   - limpiar contenedores dinámicos shell
   - sincronizar bloque visual usuario
   - refresco reactivo con i18n
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
  if (
    typeof document ===
    "undefined"
  ) {
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
          .slice(
            0,
            2
          )
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
      const oldImg =
        dom.sidebarAvatar.querySelector(
          'img[data-avatar-image="true"]'
        );

      oldImg?.remove();

      dom.sidebarAvatar.textContent =
        avatarText;

      dom.sidebarAvatar.classList.remove(
        "has-image"
      );
    } else {
      let img =
        dom.sidebarAvatar.querySelector(
          'img[data-avatar-image="true"]'
        );

      if (!img) {
        img =
          document.createElement(
            "img"
          );

        img.dataset.avatarImage =
          "true";

        img.loading =
          "lazy";

        img.decoding =
          "async";

        dom.sidebarAvatar.innerHTML =
          "";

        dom.sidebarAvatar.appendChild(
          img
        );
      }

      img.src =
        avatarUrl;
      img.alt =
        avatarAlt;

      dom.sidebarAvatar.classList.add(
        "has-image"
      );
    }

    dom.sidebarAvatar.setAttribute(
      "aria-label",
      avatarAlt
    );

    dom.sidebarAvatar.setAttribute(
      "title",
      displayName
    );

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

/* =========================================================
   Onion SPA - Core UI
   Archivo: src/core/ui.js

   Responsabilidades:
   - helpers UI globales del core
   - sincronizar título del documento
   - limpiar contenedores dinámicos del shell
   - sincronizar bloque visual de usuario
========================================================= */

import { config } from "./config.js";
import {
  getUserDisplayName,
  getUserUsername,
  getUserAvatarUrl,
  getInitials,
} from "./helpers.js";

/* =========================================================
   DOCUMENT TITLE
========================================================= */
export function setDocumentTitle({
  dom,
  events,
  title = config.appName,
}) {
  if (typeof document === "undefined") return;

  const safeTitle = String(title || config.appName);
  document.title = safeTitle;

  if (dom?.topbarTitle) {
    dom.topbarTitle.textContent = safeTitle;
  }

  events?.emit?.("app:title:change", {
    title: safeTitle,
  });
}

/* =========================================================
   DYNAMIC CONTAINERS
========================================================= */
export function clearDynamicContainers({
  dom,
  events,
}) {
  if (dom?.topbarViewContainer) {
    dom.topbarViewContainer.innerHTML = "";
  }

  if (dom?.tableheadContainer) {
    dom.tableheadContainer.innerHTML = "";
  }

  events?.emit?.("app:dynamic:cleared", {});
}

/* =========================================================
   USER UI
========================================================= */
export function syncUserUI({
  state,
  dom,
  events,
}) {
  const user = state?.user || null;
  const displayName = getUserDisplayName(user);
  const username = getUserUsername(user);
  const avatarText =
    getInitials(displayName) ||
    (username ? username.slice(0, 2).toUpperCase() : "ON");
  const avatarUrl = getUserAvatarUrl(user);

  if (dom?.sidebarName) {
    dom.sidebarName.textContent = displayName;

    if (username) {
      dom.sidebarName.dataset.username = username;
    } else {
      delete dom.sidebarName.dataset.username;
    }
  }

  if (dom?.sidebarAvatar) {
    if (!avatarUrl) {
      const avatarImage = dom.sidebarAvatar.querySelector("img[data-avatar-image]");

      if (avatarImage) {
        avatarImage.remove();
      }

      dom.sidebarAvatar.textContent = avatarText;
      dom.sidebarAvatar.classList.remove("has-image");
    } else {
      let avatarImage = dom.sidebarAvatar.querySelector("img[data-avatar-image]");

      if (!avatarImage) {
        avatarImage = document.createElement("img");
        avatarImage.dataset.avatarImage = "true";
        avatarImage.loading = "lazy";
        dom.sidebarAvatar.innerHTML = "";
        dom.sidebarAvatar.appendChild(avatarImage);
      }

      avatarImage.src = avatarUrl;
      avatarImage.alt = `Avatar ${displayName}`;
      dom.sidebarAvatar.classList.add("has-image");
    }

    dom.sidebarAvatar.setAttribute("aria-label", `Avatar ${displayName}`);
    dom.sidebarAvatar.setAttribute("title", displayName);

    if (username) {
      dom.sidebarAvatar.dataset.username = username;
    } else {
      delete dom.sidebarAvatar.dataset.username;
    }
  }

  events?.emit?.("app:user-ui:sync", {
    displayName,
    avatarText,
    avatarUrl: avatarUrl || null,
    username: username || null,
  });
}

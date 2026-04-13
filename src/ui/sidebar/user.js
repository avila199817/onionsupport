/* =========================================================
   Onion SPA - Sidebar User
   Archivo: src/ui/sidebar/user.js

   Responsabilidades:
   - resolver usuario actual desde AppCore
   - obtener display name robusto
   - obtener username normalizado
   - construir iniciales del avatar
   - resolver URL de avatar
   - detectar rol admin
   - renderizar usuario en el footer
   - pintar avatar real o fallback
   - soportar hasAvatar / avatarUpdatedAt
   - evitar que una URL vacía o rota rompa el footer
   - respetar la estructura DOM del template
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

/* =========================================================
   HELPERS BASE
========================================================= */
function normalizeString(
  value = ""
) {
  return String(value ?? "").trim();
}

function normalizeBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return fallback;
}

/* =========================================================
   USER HELPERS
========================================================= */
export function getUser(
  AppCore
) {
  return (
    AppCore?.state?.user ||
    null
  );
}

export function getDisplayName(
  AppCore,
  user = null
) {
  const currentUser =
    user || getUser(AppCore);

  return (
    currentUser?.name ||
    currentUser?.nombre ||
    currentUser?.displayName ||
    currentUser?.fullName ||
    currentUser?.username ||
    currentUser?.email ||
    "Usuario"
  );
}

export function getUsername(
  AppCore,
  user = null
) {
  const currentUser =
    user || getUser(AppCore);

  if (
    typeof AppCore?.getUserUsername ===
    "function"
  ) {
    return (
      AppCore.getUserUsername(
        currentUser
      ) || ""
    );
  }

  if (
    typeof AppCore?.utils
      ?.getUserUsername ===
    "function"
  ) {
    return (
      AppCore.utils.getUserUsername(
        currentUser
      ) || ""
    );
  }

  return normalizeString(
    currentUser?.username
  ).toLowerCase();
}

export function getAvatarText(
  AppCore,
  user = null
) {
  const currentUser =
    user || getUser(AppCore);

  const displayName =
    getDisplayName(
      AppCore,
      currentUser
    );

  const username =
    getUsername(
      AppCore,
      currentUser
    );

  const initials = String(
    displayName || ""
  )
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(
      (part) =>
        part[0]?.toUpperCase() ||
        ""
    )
    .join("")
    .slice(0, 2);

  return (
    initials ||
    (
      username
        ? username
            .slice(0, 2)
            .toUpperCase()
        : "ON"
    )
  );
}

export function getAvatarUrl(
  user = null
) {
  const currentUser =
    user || null;

  if (!currentUser) {
    return "";
  }

  const hasAvatar =
    currentUser?.hasAvatar ??
    currentUser?.has_avatar ??
    currentUser?.avatarEnabled ??
    currentUser?.avatar_enabled;

  const avatar = normalizeString(
    currentUser?.avatar ||
      currentUser?.avatarUrl ||
      currentUser?.avatar_url ||
      currentUser?.photo ||
      currentUser?.photoUrl ||
      currentUser?.photo_url ||
      currentUser?.image ||
      currentUser?.imageUrl ||
      currentUser?.image_url ||
      currentUser?.profileImage ||
      currentUser?.picture ||
      currentUser?.pictureUrl ||
      currentUser?.picture_url ||
      ""
  );

  if (!avatar) {
    return "";
  }

  if (
    hasAvatar !== undefined &&
    !normalizeBoolean(
      hasAvatar,
      false
    )
  ) {
    return "";
  }

  return avatar;
}

export function isAdmin(
  AppCore,
  user = null
) {
  const currentUser =
    user || getUser(AppCore);

  const role =
    currentUser?.role ||
    AppCore?.state?.role ||
    "";

  return (
    normalizeString(role).toLowerCase() ===
    "admin"
  );
}

/* =========================================================
   AVATAR DOM HELPERS
========================================================= */
function getAvatarNodes(
  avatarEl
) {
  if (!avatarEl) {
    return {
      imgEl: null,
      fallbackEl: null,
    };
  }

  const imgEl =
    avatarEl.querySelector(
      "#sidebarAvatarImage, .avatar-image"
    );

  const fallbackEl =
    avatarEl.querySelector(
      "#sidebarAvatarFallback, .avatar-fallback"
    );

  return {
    imgEl,
    fallbackEl,
  };
}

/* =========================================================
   AVATAR RENDER
========================================================= */
export function renderAvatarFallback(
  avatarEl,
  displayName,
  avatarText
) {
  if (!avatarEl) return;

  const {
    imgEl,
    fallbackEl,
  } = getAvatarNodes(
    avatarEl
  );

  avatarEl.classList.remove(
    "has-image"
  );

  avatarEl.setAttribute(
    "aria-label",
    `Avatar de ${displayName}`
  );

  avatarEl.setAttribute(
    "title",
    displayName
  );

  avatarEl.removeAttribute(
    "data-tooltip"
  );

  if (imgEl) {
    imgEl.hidden = true;
    imgEl.removeAttribute("src");
  }

  if (fallbackEl) {
    fallbackEl.hidden = false;
    fallbackEl.textContent =
      avatarText;
  } else {
    avatarEl.textContent =
      avatarText;
  }
}

export function renderAvatarImage(
  avatarEl,
  avatarUrl,
  displayName,
  avatarText
) {
  if (!avatarEl) return;

  const safeUrl =
    normalizeString(
      avatarUrl
    );

  if (!safeUrl) {
    renderAvatarFallback(
      avatarEl,
      displayName,
      avatarText
    );
    return;
  }

  const {
    imgEl,
    fallbackEl,
  } = getAvatarNodes(
    avatarEl
  );

  avatarEl.classList.add(
    "has-image"
  );

  avatarEl.setAttribute(
    "aria-label",
    `Avatar de ${displayName}`
  );

  avatarEl.setAttribute(
    "title",
    displayName
  );

  avatarEl.removeAttribute(
    "data-tooltip"
  );

  if (!imgEl) {
    renderAvatarFallback(
      avatarEl,
      displayName,
      avatarText
    );
    return;
  }

  imgEl.alt = `Avatar de ${displayName}`;
  imgEl.loading = "eager";
  imgEl.decoding = "async";
  imgEl.draggable = false;
  imgEl.referrerPolicy =
    "no-referrer";

  imgEl.onerror = () => {
    renderAvatarFallback(
      avatarEl,
      displayName,
      avatarText
    );
  };

  imgEl.src = safeUrl;
  imgEl.hidden = false;

  if (fallbackEl) {
    fallbackEl.hidden = true;
    fallbackEl.textContent =
      avatarText;
  }
}

/* =========================================================
   USER UI
========================================================= */
export function renderUser(
  AppCore
) {
  const {
    nameEl,
    avatarEl,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const user =
    getUser(AppCore);

  const displayName =
    getDisplayName(
      AppCore,
      user
    );

  const avatarText =
    getAvatarText(
      AppCore,
      user
    );

  const username =
    getUsername(
      AppCore,
      user
    );

  const avatarUrl =
    getAvatarUrl(user);

  if (nameEl) {
    nameEl.textContent =
      displayName;

    nameEl.removeAttribute(
      "data-tooltip"
    );

    nameEl.removeAttribute(
      "title"
    );

    if (username) {
      nameEl.dataset.username =
        username;
    } else {
      delete nameEl.dataset
        .username;
    }
  }

  if (avatarEl) {
    if (avatarUrl) {
      renderAvatarImage(
        avatarEl,
        avatarUrl,
        displayName,
        avatarText
      );
    } else {
      renderAvatarFallback(
        avatarEl,
        displayName,
        avatarText
      );
    }

    if (username) {
      avatarEl.dataset.username =
        username;
    } else {
      delete avatarEl.dataset
        .username;
    }
  }

  if (userToggle) {
    userToggle.setAttribute(
      "aria-label",
      `Abrir menú de usuario de ${displayName}`
    );

    userToggle.removeAttribute(
      "data-tooltip"
    );

    userToggle.removeAttribute(
      "title"
    );
  }

  if (userDropdown) {
    userDropdown.removeAttribute(
      "data-tooltip"
    );

    userDropdown.removeAttribute(
      "title"
    );
  }

  sanitizeFooterTooltipState(
    AppCore
  );

  AppCore?.events?.emit?.(
    "sidebar:user:rendered",
    {
      user,
      displayName,
      avatarText,
      avatarUrl:
        avatarUrl || null,
      username:
        username || null,
    }
  );
}

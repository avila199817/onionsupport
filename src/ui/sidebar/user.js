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
   AVATAR RENDER
========================================================= */
export function renderAvatarFallback(
  avatarEl,
  displayName,
  avatarText
) {
  if (!avatarEl) return;

  avatarEl.innerHTML = "";
  avatarEl.textContent =
    avatarText;

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

  const img =
    document.createElement(
      "img"
    );

  img.src = safeUrl;
  img.alt = `Avatar de ${displayName}`;
  img.loading = "eager";
  img.decoding = "async";
  img.draggable = false;
  img.referrerPolicy = "no-referrer";

  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";
  img.style.borderRadius = "50%";
  img.style.display = "block";

  img.onerror = () => {
    renderAvatarFallback(
      avatarEl,
      displayName,
      avatarText
    );
  };

  avatarEl.innerHTML = "";
  avatarEl.appendChild(img);
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
    renderAvatarImage(
      avatarEl,
      avatarUrl,
      displayName,
      avatarText
    );

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

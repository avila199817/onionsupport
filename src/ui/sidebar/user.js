/* =========================================================
   Onion SPA - Sidebar User
   Archivo: src/ui/sidebar/user.js

   RESPONSABILIDADES:
   - resolver usuario actual desde AppCore
   - obtener display name robusto
   - obtener username normalizado
   - construir iniciales del avatar
   - resolver URL de avatar
   - detectar rol admin con aliases/flags
   - renderizar usuario en el footer
   - pintar avatar real o fallback
   - soportar hasAvatar / avatarUpdatedAt
   - evitar que una URL vacía o rota rompa el footer
   - respetar la estructura DOM del template
   - evitar tooltips nativos en avatar/footer
   - evitar title/data-tooltip residuales
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_DISPLAY_NAME = "Usuario";
const DEFAULT_AVATAR_TEXT = "ON";

const ADMIN_ROLE_KEYS = new Set([
  "admin",
  "administrator",
  "administrador",
  "superadmin",
  "super_admin",
  "super_administrador",
  "owner",
  "root",
]);

const AVATAR_CACHE_PARAM = "v";

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return [];
  }

  return [value];
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;

    return value;
  }

  return null;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí"].includes(key)) return true;
    if (["false", "0", "no"].includes(key)) return false;
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function removeTooltipAttributes(element = null) {
  if (!element) return;

  try {
    element.removeAttribute("title");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("data-i18n-data-tooltip");
    element.removeAttribute("aria-describedby");
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  try {
    AppCore?.events?.emit?.(name, payload);
    return true;
  } catch {}

  try {
    if (isBrowser()) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );
      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   ROLE HELPERS
========================================================= */

function normalizeRole(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_:.]/g, "")
    .trim();
}

function normalizeRoles(value) {
  return toArray(value)
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRole(value));
}

function getRawUserBranches(user = null) {
  const current = safeObject(user);

  return [
    current,
    safeObject(current.raw),
    safeObject(current.profile),
    safeObject(current.meta),
    safeObject(current.claims),
    safeObject(current.permissions),
    safeObject(current.raw?.profile),
    safeObject(current.raw?.meta),
    safeObject(current.raw?.claims),
  ];
}

function collectRoleCandidates(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const current = safeObject(user || getUser(AppCore));
  const branches = getRawUserBranches(current);

  const directRoles = [
    state.role,
    state.rol,
    state.userRole,
    state.type,

    session.role,
    session.rol,
    session.userRole,
    session.type,

    ...branches.flatMap((branch) => [
      branch.role,
      branch.rol,
      branch.userRole,
      branch.type,
      branch.userType,
      branch.perfil,
      branch["custom:role"],
      branch["https://onion/role"],
    ]),
  ];

  const arrayRoles = [
    state.roles,
    state.permissions,
    state.scopes,
    state.groups,
    state.authorities,

    session.roles,
    session.permissions,
    session.scopes,
    session.groups,
    session.authorities,

    ...branches.flatMap((branch) => [
      branch.roles,
      branch.roleList,
      branch.permissions,
      branch.scopes,
      branch.groups,
      branch.authorities,
      branch.items,
    ]),
  ];

  return normalizeRoles([
    ...directRoles,
    ...arrayRoles.flatMap((value) => toArray(value)),
  ]);
}

function hasAdminFlag(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const current = safeObject(user || getUser(AppCore));
  const branches = getRawUserBranches(current);

  return [
    state.isAdmin,
    state.admin,
    state.isSuperAdmin,
    state.superAdmin,
    state.canManageUsers,
    state.canAccessUsers,

    session.isAdmin,
    session.admin,
    session.isSuperAdmin,
    session.superAdmin,
    session.canManageUsers,
    session.canAccessUsers,

    ...branches.flatMap((branch) => [
      branch.isAdmin,
      branch.admin,
      branch.isSuperAdmin,
      branch.superAdmin,
      branch.canManageUsers,
      branch.canAccessUsers,
    ]),
  ].some((value) => normalizeBoolean(value, false));
}

/* =========================================================
   USER RESOLUTION
========================================================= */

export function getUser(AppCore) {
  const state = safeObject(AppCore?.state);

  const user = first(
    state.user,
    state.currentUser,
    state.sessionUser,
    state.authUser,
    state.session?.user
  );

  return safeObject(user);
}

export function getDisplayName(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));
  const raw = safeObject(currentUser.raw);
  const profile = safeObject(currentUser.profile);

  try {
    if (typeof AppCore?.getUserDisplayName === "function") {
      const value = safeText(
        AppCore.getUserDisplayName(currentUser),
        ""
      );

      if (value) return value;
    }
  } catch {}

  try {
    if (typeof AppCore?.utils?.getUserDisplayName === "function") {
      const value = safeText(
        AppCore.utils.getUserDisplayName(currentUser),
        ""
      );

      if (value) return value;
    }
  } catch {}

  return safeText(
    first(
      currentUser.displayName,
      currentUser.fullName,
      currentUser.name,
      currentUser.nombre,
      currentUser.username,
      currentUser.userName,
      currentUser.email,
      currentUser.phone,
      currentUser.telefono,

      profile.displayName,
      profile.fullName,
      profile.name,
      profile.nombre,
      profile.username,
      profile.email,

      raw.displayName,
      raw.fullName,
      raw.name,
      raw.nombre,
      raw.username,
      raw.email
    ),
    DEFAULT_DISPLAY_NAME
  );
}

export function getUsername(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));
  const raw = safeObject(currentUser.raw);
  const profile = safeObject(currentUser.profile);

  try {
    if (typeof AppCore?.getUserUsername === "function") {
      const value = safeText(
        AppCore.getUserUsername(currentUser),
        ""
      );

      if (value) return value.toLowerCase();
    }
  } catch {}

  try {
    if (typeof AppCore?.utils?.getUserUsername === "function") {
      const value = safeText(
        AppCore.utils.getUserUsername(currentUser),
        ""
      );

      if (value) return value.toLowerCase();
    }
  } catch {}

  return safeText(
    first(
      currentUser.username,
      currentUser.userName,
      currentUser.nick,
      currentUser.alias,
      profile.username,
      profile.userName,
      raw.username,
      raw.userName
    ),
    ""
  )
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

export function getAvatarText(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));

  const displayName = getDisplayName(
    AppCore,
    currentUser
  );

  const username = getUsername(
    AppCore,
    currentUser
  );

  const initials = safeText(displayName, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2);

  if (initials) {
    return initials;
  }

  if (username) {
    return username
      .slice(0, 2)
      .toUpperCase();
  }

  return DEFAULT_AVATAR_TEXT;
}

/* =========================================================
   AVATAR URL
========================================================= */

function getAvatarUpdatedAt(user = null) {
  const currentUser = safeObject(user);

  return safeText(
    first(
      currentUser.avatarUpdatedAt,
      currentUser.avatar_updated_at,
      currentUser.pictureUpdatedAt,
      currentUser.picture_updated_at,
      currentUser.photoUpdatedAt,
      currentUser.photo_updated_at,
      currentUser.updatedAt,
      currentUser.updated_at,
      currentUser.raw?.avatarUpdatedAt,
      currentUser.raw?.avatar_updated_at,
      currentUser.profile?.avatarUpdatedAt,
      currentUser.profile?.avatar_updated_at
    ),
    ""
  );
}

function sanitizeAvatarUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  const lower = raw.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:")
  ) {
    return "";
  }

  if (
    lower.startsWith("data:") &&
    !lower.startsWith("data:image/")
  ) {
    return "";
  }

  return raw;
}

function appendAvatarCacheBust(url = "", updatedAt = "") {
  const cleanUrl = sanitizeAvatarUrl(url);
  const cleanUpdatedAt = safeText(updatedAt, "");

  if (!cleanUrl || !cleanUpdatedAt) {
    return cleanUrl;
  }

  const lower = cleanUrl.toLowerCase();

  if (
    lower.startsWith("data:") ||
    lower.startsWith("blob:")
  ) {
    return cleanUrl;
  }

  try {
    const base =
      isBrowser() && window.location?.origin
        ? window.location.origin
        : "http://localhost";

    const parsed = new URL(cleanUrl, base);

    parsed.searchParams.set(
      AVATAR_CACHE_PARAM,
      cleanUpdatedAt
    );

    if (
      cleanUrl.startsWith("/") ||
      cleanUrl.startsWith("./") ||
      cleanUrl.startsWith("../")
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }

    return parsed.toString();
  } catch {
    return cleanUrl;
  }
}

export function getAvatarUrl(user = null) {
  const currentUser = safeObject(user);

  if (!Object.keys(currentUser).length) {
    return "";
  }

  const hasAvatar = first(
    currentUser.hasAvatar,
    currentUser.has_avatar,
    currentUser.avatarEnabled,
    currentUser.avatar_enabled,
    currentUser.raw?.hasAvatar,
    currentUser.raw?.has_avatar,
    currentUser.profile?.hasAvatar,
    currentUser.profile?.has_avatar
  );

  const explicitAvatar = first(
    currentUser.avatar,
    currentUser.avatarUrl,
    currentUser.avatar_url,
    currentUser.photo,
    currentUser.photoUrl,
    currentUser.photo_url,
    currentUser.image,
    currentUser.imageUrl,
    currentUser.image_url,
    currentUser.profileImage,
    currentUser.profileImageUrl,
    currentUser.picture,
    currentUser.pictureUrl,
    currentUser.picture_url,

    currentUser.profile?.avatar,
    currentUser.profile?.avatarUrl,
    currentUser.profile?.avatar_url,
    currentUser.profile?.photo,
    currentUser.profile?.photoUrl,
    currentUser.profile?.picture,
    currentUser.profile?.pictureUrl,

    currentUser.raw?.avatar,
    currentUser.raw?.avatarUrl,
    currentUser.raw?.avatar_url,
    currentUser.raw?.photo,
    currentUser.raw?.photoUrl,
    currentUser.raw?.picture,
    currentUser.raw?.pictureUrl
  );

  const avatar = sanitizeAvatarUrl(explicitAvatar);

  if (!avatar) {
    return "";
  }

  if (
    hasAvatar !== null &&
    hasAvatar !== undefined &&
    normalizeBoolean(hasAvatar, false) === false
  ) {
    return "";
  }

  return appendAvatarCacheBust(
    avatar,
    getAvatarUpdatedAt(currentUser)
  );
}

export function isAdmin(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));

  if (hasAdminFlag(AppCore, currentUser)) {
    return true;
  }

  return collectRoleCandidates(AppCore, currentUser).some(isAdminRole);
}

/* =========================================================
   AVATAR DOM HELPERS
========================================================= */

function getAvatarNodes(avatarEl) {
  if (!avatarEl) {
    return {
      imgEl: null,
      fallbackEl: null,
    };
  }

  let imgEl = null;
  let fallbackEl = null;

  try {
    imgEl =
      avatarEl.querySelector("#sidebarAvatarImage") ||
      avatarEl.querySelector(".avatar-image") ||
      null;
  } catch {}

  try {
    fallbackEl =
      avatarEl.querySelector("#sidebarAvatarFallback") ||
      avatarEl.querySelector(".avatar-fallback") ||
      null;
  } catch {}

  return {
    imgEl,
    fallbackEl,
  };
}

function syncAvatarBaseAttrs(avatarEl, displayName) {
  if (!avatarEl) return;

  const finalDisplayName = safeText(
    displayName,
    DEFAULT_DISPLAY_NAME
  );

  try {
    avatarEl.setAttribute(
      "aria-label",
      `Avatar de ${finalDisplayName}`
    );

    avatarEl.dataset.displayName = finalDisplayName;
  } catch {}

  removeTooltipAttributes(avatarEl);
}

function clearImageNode(imgEl = null) {
  if (!imgEl) return;

  try {
    imgEl.hidden = true;
    imgEl.removeAttribute("src");
    imgEl.removeAttribute("srcset");
    imgEl.removeAttribute("sizes");
    imgEl.removeAttribute("title");
    imgEl.removeAttribute("data-tooltip");
    imgEl.onerror = null;
  } catch {}
}

/* =========================================================
   AVATAR RENDER
========================================================= */

export function renderAvatarFallback(
  avatarEl,
  displayName = DEFAULT_DISPLAY_NAME,
  avatarText = DEFAULT_AVATAR_TEXT
) {
  if (!avatarEl) return false;

  const finalDisplayName = safeText(
    displayName,
    DEFAULT_DISPLAY_NAME
  );

  const finalAvatarText = safeText(
    avatarText,
    DEFAULT_AVATAR_TEXT
  )
    .slice(0, 2)
    .toUpperCase();

  const {
    imgEl,
    fallbackEl,
  } = getAvatarNodes(avatarEl);

  try {
    avatarEl.classList.remove("has-image");
    avatarEl.classList.add("has-fallback");
    avatarEl.dataset.hasImage = "false";
  } catch {}

  syncAvatarBaseAttrs(
    avatarEl,
    finalDisplayName
  );

  clearImageNode(imgEl);

  if (fallbackEl) {
    try {
      fallbackEl.hidden = false;
      fallbackEl.textContent = finalAvatarText;
      fallbackEl.setAttribute("aria-hidden", "true");
      removeTooltipAttributes(fallbackEl);
    } catch {}
  } else {
    try {
      avatarEl.textContent = finalAvatarText;
    } catch {}
  }

  return true;
}

export function renderAvatarImage(
  avatarEl,
  avatarUrl,
  displayName = DEFAULT_DISPLAY_NAME,
  avatarText = DEFAULT_AVATAR_TEXT
) {
  if (!avatarEl) return false;

  const safeUrl = sanitizeAvatarUrl(avatarUrl);

  if (!safeUrl) {
    return renderAvatarFallback(
      avatarEl,
      displayName,
      avatarText
    );
  }

  const finalDisplayName = safeText(
    displayName,
    DEFAULT_DISPLAY_NAME
  );

  const {
    imgEl,
    fallbackEl,
  } = getAvatarNodes(avatarEl);

  if (!imgEl) {
    return renderAvatarFallback(
      avatarEl,
      finalDisplayName,
      avatarText
    );
  }

  try {
    avatarEl.classList.add("has-image");
    avatarEl.classList.remove("has-fallback");
    avatarEl.dataset.hasImage = "true";
  } catch {}

  syncAvatarBaseAttrs(
    avatarEl,
    finalDisplayName
  );

  try {
    imgEl.alt = `Avatar de ${finalDisplayName}`;
    imgEl.loading = "eager";
    imgEl.decoding = "async";
    imgEl.draggable = false;
    imgEl.referrerPolicy = "no-referrer";

    removeTooltipAttributes(imgEl);

    imgEl.onerror = () => {
      renderAvatarFallback(
        avatarEl,
        finalDisplayName,
        avatarText
      );
    };

    imgEl.src = safeUrl;
    imgEl.hidden = false;
  } catch {
    return renderAvatarFallback(
      avatarEl,
      finalDisplayName,
      avatarText
    );
  }

  if (fallbackEl) {
    try {
      fallbackEl.hidden = true;
      fallbackEl.textContent = safeText(
        avatarText,
        DEFAULT_AVATAR_TEXT
      );
      removeTooltipAttributes(fallbackEl);
    } catch {}
  }

  return true;
}

/* =========================================================
   USER UI
========================================================= */

export function renderUser(AppCore) {
  const {
    nameEl,
    avatarEl,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const user = getUser(AppCore);

  const displayName = getDisplayName(
    AppCore,
    user
  );

  const avatarText = getAvatarText(
    AppCore,
    user
  );

  const username = getUsername(
    AppCore,
    user
  );

  const avatarUrl = getAvatarUrl(user);

  if (nameEl) {
    try {
      nameEl.textContent = displayName;

      if (username) {
        nameEl.dataset.username = username;
      } else {
        delete nameEl.dataset.username;
      }

      removeTooltipAttributes(nameEl);
    } catch {}
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

    try {
      if (username) {
        avatarEl.dataset.username = username;
      } else {
        delete avatarEl.dataset.username;
      }

      removeTooltipAttributes(avatarEl);
    } catch {}
  }

  if (userToggle) {
    try {
      userToggle.setAttribute(
        "aria-label",
        `Abrir menú de usuario de ${displayName}`
      );

      removeTooltipAttributes(userToggle);
    } catch {}
  }

  if (userDropdown) {
    removeTooltipAttributes(userDropdown);
  }

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch {}

  safeEmit(
    AppCore,
    "sidebar:user:rendered",
    {
      user,
      displayName,
      avatarText,
      avatarUrl: avatarUrl || null,
      username: username || null,
      isAdmin: isAdmin(AppCore, user),
    }
  );

  return {
    user,
    displayName,
    avatarText,
    avatarUrl: avatarUrl || null,
    username: username || null,
    isAdmin: isAdmin(AppCore, user),
  };
}

export default {
  getUser,
  getDisplayName,
  getUsername,
  getAvatarText,
  getAvatarUrl,
  isAdmin,

  renderAvatarFallback,
  renderAvatarImage,
  renderUser,
};

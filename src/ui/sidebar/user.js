/* =========================================================
   Onion SPA - Sidebar User
   Archivo: src/ui/sidebar/user.js

   FINAL EXTREME SYSTEM · SIDEBAR USER / AVATAR · 10/10

   RESPONSABILIDADES:
   - resolver usuario actual desde AppCore/Auth-like sources
   - obtener display name robusto
   - obtener username normalizado
   - construir iniciales del avatar
   - resolver URL de avatar
   - detectar rol admin con aliases/flags/permisos
   - renderizar usuario en el footer
   - pintar avatar real o fallback
   - soportar hasAvatar / avatarUpdatedAt
   - evitar que una URL vacía o rota rompa el footer
   - evitar carreras de carga de avatar
   - respetar la estructura DOM del template
   - evitar tooltips nativos en avatar/footer
   - evitar title/data-tooltip residuales
   - emitir snapshot estable del usuario renderizado

   HARDENING:
   - no depende de una única forma de user
   - soporta user/profile/account/meta/claims/raw
   - soporta avatarUrl/photoUrl/picture/profileImage anidados
   - bloquea protocolos peligrosos
   - cache bust con avatarUpdatedAt
   - fallback inmediato mientras carga imagen real
   - onload/onerror con token anti-race
   - admin por rol, permiso o flags
   - cero throws hacia la UI
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
const DEFAULT_PLAN_LABEL = "Go Plan";

const AVATAR_CACHE_PARAM = "v";
const AVATAR_RENDER_SEQ_DATASET_KEY = "avatarRenderSeq";

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

const ADMIN_PERMISSION_KEYS = new Set([
  "admin:*",
  "admin.all",
  "admin.full",
  "admin.manage",
  "admin:manage",

  "users.manage",
  "users:manage",
  "users.write",
  "users:write",
  "users.admin",
  "users:admin",

  "usuarios.manage",
  "usuarios:manage",
  "usuarios.write",
  "usuarios:write",
  "usuarios.admin",
  "usuarios:admin",

  "manage_users",
  "can_manage_users",
  "access_users",
  "can_access_users",

  "clients.manage",
  "clients:manage",
  "clientes.manage",
  "clientes:manage",

  "server.manage",
  "server:manage",
  "servidor.manage",
  "servidor:manage",
]);

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFn(value) {
  return typeof value === "function";
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

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    const key = value.trim().toLowerCase();

    if (["true", "1", "yes", "si", "sí", "ok", "on"].includes(key)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(key)) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  return fallback;
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.("[SidebarUser]", ...args);
  } catch {}

  try {
    console.warn("[SidebarUser]", ...args);
  } catch {}
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;

  let emitted = false;

  try {
    AppCore?.events?.emit?.(name, payload);
    emitted = true;
  } catch {}

  try {
    if (
      isBrowser() &&
      typeof CustomEvent !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(name, {
          detail: payload,
        })
      );

      emitted = true;
    }
  } catch {}

  return emitted;
}

function removeTooltipAttributes(element = null) {
  if (!element) return false;

  try {
    element.removeAttribute("title");
    element.removeAttribute("data-tooltip");
    element.removeAttribute("data-i18n-data-tooltip");
    element.removeAttribute("aria-describedby");
    return true;
  } catch {
    return false;
  }
}

function removeTooltipAttributesDeep(element = null) {
  if (!element) return false;

  removeTooltipAttributes(element);

  try {
    element
      .querySelectorAll(
        "[title], [data-tooltip], [data-i18n-data-tooltip], [aria-describedby]"
      )
      .forEach((node) => {
        removeTooltipAttributes(node);
      });

    return true;
  } catch {
    return false;
  }
}

function normalizeString(value = "") {
  return safeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return "http://localhost";
}

/* =========================================================
   USER SOURCE RESOLUTION
========================================================= */

function callUserGetter(source = null, methodName = "") {
  if (!source || !methodName) {
    return null;
  }

  try {
    if (isFn(source?.[methodName])) {
      return source[methodName]();
    }
  } catch {}

  return null;
}

function getAuthLikeSources(AppCore = null) {
  return [
    AppCore?.Auth,
    AppCore?.auth,
    AppCore?.modules?.Auth,
    AppCore?.modules?.auth,
  ].filter(Boolean);
}

function getUserFromAuthLikeSources(AppCore = null) {
  const sources = getAuthLikeSources(AppCore);

  for (const source of sources) {
    const user = first(
      callUserGetter(source, "getUser"),
      callUserGetter(source, "getCurrentUser"),
      callUserGetter(source, "currentUser"),
      source?.user,
      source?.currentUser,
      source?.state?.user,
      source?.session?.user
    );

    if (user && typeof user === "object") {
      return safeObject(user);
    }
  }

  return {};
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
    .replace(/[^a-z0-9_:.*/-]/g, "")
    .trim();
}

function flattenRoleValue(value, depth = 0) {
  if (depth > 8) {
    return [];
  }

  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      flattenRoleValue(item, depth + 1)
    );
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s|;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return [value];
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);

    const truthyKeys = entries
      .filter(([, entryValue]) => safeBoolean(entryValue, false))
      .map(([key]) => key);

    return [
      value.role,
      value.rol,
      value.name,
      value.key,
      value.value,
      value.id,
      value.code,
      value.slug,
      value.type,
      value.scope,
      value.permission,
      value.authority,

      value.roles,
      value.roleList,
      value.role_list,
      value.permissions,
      value.scopes,
      value.groups,
      value.authorities,
      value.items,
      value.list,

      ...truthyKeys,
    ].flatMap((item) =>
      flattenRoleValue(item, depth + 1)
    );
  }

  return [];
}

function normalizeRoles(value) {
  return flattenRoleValue(value)
    .flat(Infinity)
    .map(normalizeRole)
    .filter(Boolean);
}

function isAdminRole(value = "") {
  return ADMIN_ROLE_KEYS.has(normalizeRole(value));
}

function isAdminPermission(value = "") {
  const key = normalizeRole(value);

  if (!key) {
    return false;
  }

  if (ADMIN_PERMISSION_KEYS.has(key)) {
    return true;
  }

  return (
    key.startsWith("admin:") ||
    key.startsWith("admin.") ||
    key.includes(":admin") ||
    key.includes(".admin") ||
    key.endsWith(":manage") ||
    key.endsWith(".manage")
  );
}

function getRawUserBranches(user = null) {
  const current = safeObject(user);

  return [
    current,

    safeObject(current.raw),
    safeObject(current.profile),
    safeObject(current.account),
    safeObject(current.meta),
    safeObject(current.claims),
    safeObject(current.permissions),

    safeObject(current.raw?.profile),
    safeObject(current.raw?.account),
    safeObject(current.raw?.meta),
    safeObject(current.raw?.claims),
    safeObject(current.raw?.permissions),

    safeObject(current.profile?.permissions),
    safeObject(current.account?.permissions),
    safeObject(current.meta?.permissions),
    safeObject(current.claims?.permissions),
  ];
}

function collectRoleCandidates(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const current = safeObject(user || getUser(AppCore));
  const branches = getRawUserBranches(current);

  const authLikeSources = getAuthLikeSources(AppCore);

  const authRoleCandidates = authLikeSources.flatMap((source) => {
    const values = [
      source?.role,
      source?.rol,
      source?.userRole,
      source?.roles,
      source?.permissions,
      source?.scopes,
      source?.state?.role,
      source?.state?.roles,
      source?.state?.permissions,
      callUserGetter(source, "getRole"),
      callUserGetter(source, "getCurrentRole"),
      callUserGetter(source, "getRoles"),
      callUserGetter(source, "getPermissions"),
    ];

    return values;
  });

  const directRoles = [
    state.role,
    state.rol,
    state.userRole,
    state.user_role,
    state.type,
    state.userType,
    state.user_type,

    session.role,
    session.rol,
    session.userRole,
    session.user_role,
    session.type,
    session.userType,
    session.user_type,

    ...branches.flatMap((branch) => [
      branch.role,
      branch.rol,
      branch.userRole,
      branch.user_role,
      branch.type,
      branch.userType,
      branch.user_type,
      branch.perfil,
      branch.scope,
      branch.permission,
      branch.authority,
      branch["custom:role"],
      branch["custom:roles"],
      branch["custom:permissions"],
      branch["https://onion/role"],
      branch["https://onion/roles"],
      branch["https://onion/permissions"],
    ]),
  ];

  const arrayRoles = [
    state.roles,
    state.roleList,
    state.role_list,
    state.permissions,
    state.scopes,
    state.groups,
    state.authorities,

    session.roles,
    session.roleList,
    session.role_list,
    session.permissions,
    session.scopes,
    session.groups,
    session.authorities,

    ...branches.flatMap((branch) => [
      branch.roles,
      branch.roleList,
      branch.role_list,
      branch.permissions,
      branch.scopes,
      branch.groups,
      branch.authorities,
      branch.items,
      branch.list,
    ]),
  ];

  return normalizeRoles([
    ...directRoles,
    ...arrayRoles,
    ...authRoleCandidates,
  ]);
}

function hasAdminFlag(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const session = safeObject(state.session);
  const current = safeObject(user || getUser(AppCore));
  const branches = getRawUserBranches(current);

  const authLikeSources = getAuthLikeSources(AppCore);

  const authFlags = authLikeSources.flatMap((source) => [
    source?.isAdmin,
    source?.admin,
    source?.isSuperAdmin,
    source?.superAdmin,
    source?.canManageUsers,
    source?.canAccessUsers,
    callUserGetter(source, "isAdmin"),
    callUserGetter(source, "isCurrentUserAdmin"),
  ]);

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
      branch.is_admin,
      branch.isSuperAdmin,
      branch.superAdmin,
      branch.is_super_admin,
      branch.canManageUsers,
      branch.can_manage_users,
      branch.canAccessUsers,
      branch.can_access_users,
    ]),

    ...authFlags,
  ].some((value) => safeBoolean(value, false));
}

/* =========================================================
   USER RESOLUTION
========================================================= */

export function getUser(AppCore) {
  const state = safeObject(AppCore?.state);

  let user = first(
    state.user,
    state.currentUser,
    state.sessionUser,
    state.authUser,
    state.session?.user,
    state.session?.currentUser,
    state.auth?.user
  );

  if (!user || typeof user !== "object") {
    try {
      user = first(
        callUserGetter(AppCore, "getUser"),
        callUserGetter(AppCore, "getCurrentUser"),
        callUserGetter(AppCore, "currentUser")
      );
    } catch {}
  }

  if (!user || typeof user !== "object") {
    user = getUserFromAuthLikeSources(AppCore);
  }

  return safeObject(user);
}

function getProfileLikeBranches(user = null) {
  const current = safeObject(user);

  return [
    current,
    safeObject(current.profile),
    safeObject(current.account),
    safeObject(current.meta),
    safeObject(current.claims),
    safeObject(current.raw),
    safeObject(current.raw?.profile),
    safeObject(current.raw?.account),
    safeObject(current.raw?.meta),
    safeObject(current.raw?.claims),
  ];
}

export function getDisplayName(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));
  const branches = getProfileLikeBranches(currentUser);

  try {
    if (isFn(AppCore?.getUserDisplayName)) {
      const value = safeText(
        AppCore.getUserDisplayName(currentUser),
        ""
      );

      if (value) return value;
    }
  } catch {}

  try {
    if (isFn(AppCore?.utils?.getUserDisplayName)) {
      const value = safeText(
        AppCore.utils.getUserDisplayName(currentUser),
        ""
      );

      if (value) return value;
    }
  } catch {}

  const value = first(
    ...branches.flatMap((branch) => [
      branch.displayName,
      branch.display_name,
      branch.fullName,
      branch.full_name,
      branch.name,
      branch.nombre,
      branch.firstName && branch.lastName
        ? `${branch.firstName} ${branch.lastName}`
        : null,
      branch.first_name && branch.last_name
        ? `${branch.first_name} ${branch.last_name}`
        : null,
      branch.username,
      branch.userName,
      branch.user_name,
      branch.email,
      branch.phone,
      branch.telefono,
    ])
  );

  return safeText(
    value,
    DEFAULT_DISPLAY_NAME
  );
}

export function getUsername(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));
  const branches = getProfileLikeBranches(currentUser);

  try {
    if (isFn(AppCore?.getUserUsername)) {
      const value = safeText(
        AppCore.getUserUsername(currentUser),
        ""
      );

      if (value) return sanitizeUsername(value);
    }
  } catch {}

  try {
    if (isFn(AppCore?.utils?.getUserUsername)) {
      const value = safeText(
        AppCore.utils.getUserUsername(currentUser),
        ""
      );

      if (value) return sanitizeUsername(value);
    }
  } catch {}

  const value = first(
    ...branches.flatMap((branch) => [
      branch.username,
      branch.userName,
      branch.user_name,
      branch.slug,
      branch.nick,
      branch.alias,
      branch.handle,
    ])
  );

  return sanitizeUsername(value);
}

function sanitizeUsername(value = "") {
  return normalizeString(value)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function extractInitialsFromText(value = "") {
  const text = safeText(value, "");

  if (!text) {
    return "";
  }

  const parts = normalizeString(text)
    .split(/[\s._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 2);

  return initials;
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

  const email = safeText(
    first(
      currentUser.email,
      currentUser.raw?.email,
      currentUser.profile?.email,
      currentUser.claims?.email
    ),
    ""
  );

  const initials =
    extractInitialsFromText(displayName) ||
    extractInitialsFromText(username) ||
    extractInitialsFromText(email);

  if (initials) {
    return initials;
  }

  return DEFAULT_AVATAR_TEXT;
}

/* =========================================================
   AVATAR URL
========================================================= */

function getAvatarUpdatedAt(user = null) {
  const currentUser = safeObject(user);
  const branches = getProfileLikeBranches(currentUser);

  return safeText(
    first(
      ...branches.flatMap((branch) => [
        branch.avatarUpdatedAt,
        branch.avatar_updated_at,
        branch.pictureUpdatedAt,
        branch.picture_updated_at,
        branch.photoUpdatedAt,
        branch.photo_updated_at,
        branch.imageUpdatedAt,
        branch.image_updated_at,
        branch.updatedAt,
        branch.updated_at,
        branch.version,
        branch.avatarVersion,
        branch.avatar_version,
      ])
    ),
    ""
  );
}

function userHasAvatar(user = null) {
  const currentUser = safeObject(user);
  const branches = getProfileLikeBranches(currentUser);

  const rawValue = first(
    ...branches.flatMap((branch) => [
      branch.hasAvatar,
      branch.has_avatar,
      branch.avatarEnabled,
      branch.avatar_enabled,
      branch.hasPhoto,
      branch.has_photo,
      branch.hasPicture,
      branch.has_picture,
    ])
  );

  if (rawValue === null || rawValue === undefined) {
    return true;
  }

  return safeBoolean(rawValue, false);
}

function sanitizeAvatarUrl(value = "") {
  const raw = safeText(value, "");

  if (!raw) {
    return "";
  }

  const compact = raw.replace(/\s+/g, "");
  const lower = compact.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("data:text/") ||
    lower.startsWith("data:application/")
  ) {
    return "";
  }

  if (
    lower.startsWith("data:") &&
    !lower.startsWith("data:image/")
  ) {
    return "";
  }

  if (
    lower.startsWith("http://") ||
    lower.startsWith("https://") ||
    lower.startsWith("/") ||
    lower.startsWith("./") ||
    lower.startsWith("../") ||
    lower.startsWith("blob:") ||
    lower.startsWith("data:image/")
  ) {
    return raw;
  }

  /*
    Ruta relativa simple tipo "uploads/avatar.png".
  */
  if (/^[a-zA-Z0-9._~:/?#@!$&'()*+,;=%-]+$/.test(raw)) {
    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }

  return "";
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
    const parsed = new URL(
      cleanUrl,
      getBaseOrigin()
    );

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

  if (!userHasAvatar(currentUser)) {
    return "";
  }

  const branches = getProfileLikeBranches(currentUser);

  const explicitAvatar = first(
    ...branches.flatMap((branch) => [
      branch.avatar,
      branch.avatarUrl,
      branch.avatar_url,
      branch.avatarURI,
      branch.avatar_uri,

      branch.photo,
      branch.photoUrl,
      branch.photo_url,

      branch.image,
      branch.imageUrl,
      branch.image_url,

      branch.profileImage,
      branch.profileImageUrl,
      branch.profile_image,
      branch.profile_image_url,

      branch.picture,
      branch.pictureUrl,
      branch.picture_url,
      branch.pictureURI,
      branch.picture_uri,
    ])
  );

  const avatar = sanitizeAvatarUrl(explicitAvatar);

  if (!avatar) {
    return "";
  }

  return appendAvatarCacheBust(
    avatar,
    getAvatarUpdatedAt(currentUser)
  );
}

/* =========================================================
   ADMIN
========================================================= */

export function isAdmin(AppCore, user = null) {
  const currentUser = safeObject(user || getUser(AppCore));

  if (hasAdminFlag(AppCore, currentUser)) {
    return true;
  }

  return collectRoleCandidates(AppCore, currentUser).some((role) => {
    return isAdminRole(role) || isAdminPermission(role);
  });
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
      avatarEl.querySelector("img") ||
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

  removeTooltipAttributesDeep(avatarEl);
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
    imgEl.removeAttribute("data-i18n-data-tooltip");
    imgEl.removeAttribute("aria-describedby");
    imgEl.onload = null;
    imgEl.onerror = null;
  } catch {}
}

function setFallbackNode({
  avatarEl,
  fallbackEl,
  text,
  visible,
}) {
  const finalText = safeText(
    text,
    DEFAULT_AVATAR_TEXT
  )
    .slice(0, 2)
    .toUpperCase();

  if (fallbackEl) {
    try {
      fallbackEl.hidden = !visible;
      fallbackEl.textContent = finalText;
      fallbackEl.setAttribute("aria-hidden", "true");
      removeTooltipAttributes(fallbackEl);
    } catch {}

    return true;
  }

  if (avatarEl && visible) {
    try {
      avatarEl.textContent = finalText;
      return true;
    } catch {}
  }

  return false;
}

function setAvatarState(
  avatarEl,
  {
    hasImage = false,
    loading = false,
    url = "",
  } = {}
) {
  if (!avatarEl) {
    return false;
  }

  try {
    avatarEl.classList.toggle("has-image", Boolean(hasImage));
    avatarEl.classList.toggle("has-fallback", !hasImage);
    avatarEl.classList.toggle("is-loading", Boolean(loading));

    avatarEl.dataset.hasImage = hasImage ? "true" : "false";
    avatarEl.dataset.loading = loading ? "true" : "false";

    if (url) {
      avatarEl.dataset.avatarUrl = url;
    } else {
      delete avatarEl.dataset.avatarUrl;
    }

    return true;
  } catch {
    return false;
  }
}

function nextAvatarRenderSeq(avatarEl = null) {
  if (!avatarEl) {
    return "0";
  }

  const current =
    Number(avatarEl.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] || 0);

  const next =
    Number.isFinite(current)
      ? current + 1
      : Date.now();

  try {
    avatarEl.dataset[AVATAR_RENDER_SEQ_DATASET_KEY] = String(next);
  } catch {}

  return String(next);
}

function isCurrentAvatarRenderSeq(avatarEl = null, seq = "") {
  if (!avatarEl) {
    return false;
  }

  try {
    return avatarEl.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] === String(seq);
  } catch {
    return false;
  }
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
  );

  const {
    imgEl,
    fallbackEl,
  } = getAvatarNodes(avatarEl);

  nextAvatarRenderSeq(avatarEl);

  syncAvatarBaseAttrs(
    avatarEl,
    finalDisplayName
  );

  clearImageNode(imgEl);

  setFallbackNode({
    avatarEl,
    fallbackEl,
    text: finalAvatarText,
    visible: true,
  });

  setAvatarState(avatarEl, {
    hasImage: false,
    loading: false,
    url: "",
  });

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

  const finalAvatarText = safeText(
    avatarText,
    DEFAULT_AVATAR_TEXT
  );

  const {
    imgEl,
    fallbackEl,
  } = getAvatarNodes(avatarEl);

  if (!imgEl) {
    return renderAvatarFallback(
      avatarEl,
      finalDisplayName,
      finalAvatarText
    );
  }

  const renderSeq =
    nextAvatarRenderSeq(avatarEl);

  syncAvatarBaseAttrs(
    avatarEl,
    finalDisplayName
  );

  /*
    Fallback visible mientras carga.
    Así una imagen lenta/rota no deja avatar vacío.
  */
  setFallbackNode({
    avatarEl,
    fallbackEl,
    text: finalAvatarText,
    visible: true,
  });

  setAvatarState(avatarEl, {
    hasImage: false,
    loading: true,
    url: safeUrl,
  });

  try {
    imgEl.hidden = true;
    imgEl.alt = `Avatar de ${finalDisplayName}`;
    imgEl.loading = "eager";
    imgEl.decoding = "async";
    imgEl.draggable = false;
    imgEl.referrerPolicy = "no-referrer";

    removeTooltipAttributes(imgEl);

    imgEl.onload = () => {
      if (!isCurrentAvatarRenderSeq(avatarEl, renderSeq)) {
        return;
      }

      try {
        imgEl.hidden = false;
      } catch {}

      setFallbackNode({
        avatarEl,
        fallbackEl,
        text: finalAvatarText,
        visible: false,
      });

      setAvatarState(avatarEl, {
        hasImage: true,
        loading: false,
        url: safeUrl,
      });
    };

    imgEl.onerror = () => {
      if (!isCurrentAvatarRenderSeq(avatarEl, renderSeq)) {
        return;
      }

      renderAvatarFallback(
        avatarEl,
        finalDisplayName,
        finalAvatarText
      );
    };

    imgEl.src = safeUrl;

    /*
      Si la imagen ya está en caché y naturalWidth existe,
      forzamos el commit sin esperar evento.
  */
    if (
      imgEl.complete === true &&
      Number(imgEl.naturalWidth || 0) > 0
    ) {
      imgEl.onload?.();
    }
  } catch {
    return renderAvatarFallback(
      avatarEl,
      finalDisplayName,
      finalAvatarText
    );
  }

  return true;
}

/* =========================================================
   USER PLAN / FOOTER HELPERS
========================================================= */

function getPlanLabel(AppCore, user = null) {
  const state = safeObject(AppCore?.state);
  const currentUser = safeObject(user || getUser(AppCore));
  const branches = getProfileLikeBranches(currentUser);

  const value = first(
    state.plan,
    state.subscriptionPlan,
    state.subscription?.plan,
    state.account?.plan,

    ...branches.flatMap((branch) => [
      branch.plan,
      branch.planName,
      branch.plan_name,
      branch.subscriptionPlan,
      branch.subscription_plan,
      branch.subscription?.plan,
      branch.account?.plan,
    ])
  );

  return safeText(value, DEFAULT_PLAN_LABEL);
}

function getPlanElement(userToggle = null) {
  if (!userToggle) {
    return null;
  }

  try {
    return (
      userToggle.querySelector("#sidebarUserPlan") ||
      userToggle.querySelector(".plan") ||
      null
    );
  } catch {
    return null;
  }
}

function setDatasetValue(element = null, key = "", value = "") {
  if (!element || !key) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      delete element.dataset[key];
      return true;
    }

    element.dataset[key] = String(value);
    return true;
  } catch {
    return false;
  }
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

  const admin = isAdmin(AppCore, user);

  const planLabel = getPlanLabel(
    AppCore,
    user
  );

  if (nameEl) {
    try {
      nameEl.textContent = displayName;

      setDatasetValue(
        nameEl,
        "username",
        username || ""
      );

      setDatasetValue(
        nameEl,
        "displayName",
        displayName
      );

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
      setDatasetValue(
        avatarEl,
        "username",
        username || ""
      );

      setDatasetValue(
        avatarEl,
        "displayName",
        displayName
      );

      removeTooltipAttributesDeep(avatarEl);
    } catch {}
  }

  if (userToggle) {
    try {
      userToggle.setAttribute(
        "aria-label",
        `Abrir menú de usuario de ${displayName}`
      );

      setDatasetValue(
        userToggle,
        "username",
        username || ""
      );

      setDatasetValue(
        userToggle,
        "displayName",
        displayName
      );

      setDatasetValue(
        userToggle,
        "admin",
        admin ? "true" : "false"
      );

      removeTooltipAttributes(userToggle);

      const planEl =
        getPlanElement(userToggle);

      if (planEl) {
        planEl.textContent = planLabel;
        removeTooltipAttributes(planEl);
      }
    } catch {}
  }

  if (userDropdown) {
    try {
      setDatasetValue(
        userDropdown,
        "username",
        username || ""
      );

      setDatasetValue(
        userDropdown,
        "admin",
        admin ? "true" : "false"
      );

      removeTooltipAttributes(userDropdown);
    } catch {}
  }

  try {
    sanitizeFooterTooltipState(AppCore);
  } catch (error) {
    safeWarn(
      AppCore,
      "sanitizeFooterTooltipState falló tras renderUser.",
      error
    );
  }

  const snapshot = {
    user,
    displayName,
    avatarText,
    avatarUrl: avatarUrl || null,
    username: username || null,
    planLabel,
    isAdmin: admin,
  };

  safeEmit(
    AppCore,
    "sidebar:user:rendered",
    snapshot
  );

  safeEmit(
    AppCore,
    "app:user-ui:rendered",
    {
      source: "sidebar.user",
      ...snapshot,
    }
  );

  return snapshot;
}

/* =========================================================
   DEBUG
========================================================= */

export function getSidebarUserSnapshot(AppCore) {
  const {
    nameEl,
    avatarEl,
    userToggle,
    userDropdown,
  } = getElements(AppCore);

  const user = getUser(AppCore);
  const displayName = getDisplayName(AppCore, user);
  const username = getUsername(AppCore, user);
  const avatarText = getAvatarText(AppCore, user);
  const avatarUrl = getAvatarUrl(user);

  return {
    hasUser:
      Boolean(Object.keys(user).length),

    user,

    displayName,
    username: username || null,
    avatarText,
    avatarUrl: avatarUrl || null,
    planLabel:
      getPlanLabel(AppCore, user),

    isAdmin:
      isAdmin(AppCore, user),

    roles:
      collectRoleCandidates(AppCore, user),

    dom: {
      hasName:
        Boolean(nameEl),

      nameText:
        nameEl?.textContent || "",

      hasAvatar:
        Boolean(avatarEl),

      avatarClasses:
        avatarEl?.className || "",

      avatarHasImage:
        avatarEl?.dataset?.hasImage || "",

      avatarLoading:
        avatarEl?.dataset?.loading || "",

      avatarUrl:
        avatarEl?.dataset?.avatarUrl || "",

      hasUserToggle:
        Boolean(userToggle),

      userToggleAriaLabel:
        userToggle?.getAttribute?.("aria-label") || "",

      userToggleAriaExpanded:
        userToggle?.getAttribute?.("aria-expanded") || "",

      hasUserDropdown:
        Boolean(userDropdown),

      userDropdownAriaHidden:
        userDropdown?.getAttribute?.("aria-hidden") || "",
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

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

  getSidebarUserSnapshot,
};

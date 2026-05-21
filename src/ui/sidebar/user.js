/* =========================================================
   Onion Support - Sidebar User
   Archivo: /src/ui/sidebar/user.js

   Responsabilidad:
   - Normalizar usuario para el sidebar.
   - Resolver rol admin/user.
   - Resolver label visible de rol.
   - Resolver slug público real.
   - Resolver displayName, email y avatarUrl para template/dropdown.
   - Leer avatar canónico desde avatar/avatarUrl/photo/picture/image.
   - Tratar hasAvatar sólo como señal diagnóstica, no como URL.
   - Crear view-model mínimo para template.js.
   - No pintar DOM.
   - No hacer eventos.
   - No leer storage.
   - No hacer HTTP.
   - No gestionar dropdown.
   - No gestionar permisos.
   - No inventar slug.
   - No usar email como identidad.
   - No duplicar lógica visual del avatar.
========================================================= */

import {
  SIDEBAR_ROLE_ADMIN,
  SIDEBAR_ROLE_USER,
} from "./constants.js";

export const SIDEBAR_USER_VERSION = "sidebar.user.v8";

const DEFAULT_NAME = "Usuario";
const DEFAULT_INITIALS = "U";

const ROLE_LABEL_ADMIN = "Administrador";
const ROLE_LABEL_STANDARD = "Estándar";

const MAX_NAME_LENGTH = 120;
const MAX_USERNAME_LENGTH = 96;
const MAX_EMAIL_LENGTH = 254;
const MAX_AVATAR_URL_LENGTH = 2048;

const INVALID_USER_STATUSES = Object.freeze([
  "disabled",
  "inactive",
  "deleted",
  "archived",
  "revoked",
  "blocked",
  "banned",
  "suspended",
  "desactivado",
  "inactivo",
  "eliminado",
  "archivado",
  "bloqueado",
  "suspendido",
]);

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof window.location !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function stringText(value = "", fallback = "") {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback;
  }

  return text(value, fallback);
}

function limitText(value = "", limit = 120) {
  return text(value, "").slice(0, limit);
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isObject(value) && Object.keys(value).length === 0) continue;

    return value;
  }

  return null;
}

function safeCall(fn = null, ...args) {
  if (!isFunction(fn)) return null;

  try {
    return fn(...args);
  } catch {
    return null;
  }
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature)=/i.test(
    String(value || "")
  );
}

function isLocalDevHost(hostname = "") {
  const host = String(hostname || "").toLowerCase();

  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function normalizeInternalAssetPath(value = "") {
  const raw = stringText(value, "");

  if (!raw) return "";
  if (/[\r\n\t\\]/.test(raw)) return "";
  if (hasSensitiveQuery(raw)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(raw)) return "";
  if (/^\/\//.test(raw)) return "";

  const [pathPart = "", hashPart = ""] = raw.split("#");
  const [pathname = "", query = ""] = pathPart.split("?");

  const cleanPath = String(pathname || "")
    .trim()
    .replace(/^\.?\//, "")
    .replace(/\/{2,}/g, "/");

  if (!cleanPath) return "";

  const finalPath = `/${cleanPath}`;

  return `${finalPath}${query ? `?${query}` : ""}${hashPart ? `#${hashPart}` : ""}`;
}

/* =========================================================
   SLUG
========================================================= */

export function normalizeSidebarUserSlug(value = "") {
  const slug = text(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^\/+/, "")
    .replace(/^@+/, "")
    .split(/[/?#]/)[0]
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();

  if (!slug) return "";

  return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
}

export function getSidebarUserSlug(user = null) {
  if (!isObject(user)) return "";

  return normalizeSidebarUserSlug(
    first(
      user.slug,
      user.lookup?.slug,
      user.profile?.slug,
      user.routing?.slug,
      user.publicSlug,
      ""
    )
  );
}

/* =========================================================
   USER VALIDATION
========================================================= */

export function isSidebarUserDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = text(
    user.status ||
      user.estado ||
      user.state ||
      "",
    ""
  ).toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.deleted === true ||
      user.archived === true ||
      user.revoked === true ||
      user.blocked === true ||
      user.banned === true ||
      user.suspended === true ||
      user.active === false ||
      user.enabled === false ||
      Boolean(user.deletedAt) ||
      INVALID_USER_STATUSES.includes(status)
  );
}

export function hasSidebarUserIdentity(user = null) {
  if (!isObject(user)) return false;

  /*
    Email no cuenta como identidad.
    La identidad mínima válida debe venir de id/userId/uid/sub/username/slug.
  */
  return Boolean(
    text(user.id, "") ||
      text(user.userId, "") ||
      text(user.uid, "") ||
      text(user.sub, "") ||
      text(user.username, "") ||
      text(user.userName, "") ||
      getSidebarUserSlug(user)
  );
}

export function isUsableSidebarUser(user = null) {
  return Boolean(
    isObject(user) &&
      !isSidebarUserDisabled(user) &&
      hasSidebarUserIdentity(user)
  );
}

/* =========================================================
   UNWRAP
========================================================= */

export function unwrapSidebarUser(payload = null) {
  if (!isObject(payload)) return null;

  const direct = first(
    payload.user,
    payload.usuario,
    payload.currentUser,
    payload.authUser,
    payload.sessionUser,
    payload.session?.user,
    payload.sessionData?.user,
    payload.data?.user,
    payload.data?.currentUser,
    payload.data?.me,
    payload.payload?.user,
    payload.payload?.me,
    payload.result?.user,
    payload.auth?.user,
    payload.me,
    payload.account,
    payload.profile
  );

  if (isUsableSidebarUser(direct)) return direct;
  if (isUsableSidebarUser(payload)) return payload;

  return null;
}

/* =========================================================
   SOURCES
========================================================= */

function getUserFromAuth(Auth = null) {
  if (!isObject(Auth)) return null;

  const candidates = [
    safeCall(Auth.getUser?.bind?.(Auth) || Auth.getUser),
    safeCall(Auth.getCurrentUser?.bind?.(Auth) || Auth.getCurrentUser),
    safeCall(Auth.getProfile?.bind?.(Auth) || Auth.getProfile),
    Auth.user,
    Auth.currentUser,
    Auth.session?.user,
    Auth.state?.user,
  ];

  return candidates.map(unwrapSidebarUser).find(isUsableSidebarUser) || null;
}

function getUserFromCore(AppCore = null) {
  if (!isObject(AppCore)) return null;

  const state = isObject(AppCore.state) ? AppCore.state : {};

  const candidates = [
    state.user,
    state.currentUser,
    state.authUser,
    state.sessionUser,
    state.session?.user,
    state.sessionData?.user,
    state.auth?.user,
    AppCore.user,
    AppCore.currentUser,
  ];

  return candidates.map(unwrapSidebarUser).find(isUsableSidebarUser) || null;
}

export function getSidebarUserSource(context = {}) {
  const explicit = unwrapSidebarUser(context.user);

  if (isUsableSidebarUser(explicit)) return explicit;

  const authUser = getUserFromAuth(context.Auth);

  if (isUsableSidebarUser(authUser)) return authUser;

  const coreUser = getUserFromCore(context.AppCore);

  if (isUsableSidebarUser(coreUser)) return coreUser;

  return null;
}

/* =========================================================
   ROLE
========================================================= */

function normalizeRoleValue(value = null) {
  if (Array.isArray(value)) {
    const roles = value
      .map(normalizeRoleValue)
      .filter(Boolean);

    if (roles.includes(SIDEBAR_ROLE_ADMIN)) return SIDEBAR_ROLE_ADMIN;
    if (roles.includes(SIDEBAR_ROLE_USER)) return SIDEBAR_ROLE_USER;

    return "";
  }

  const role = String(value || "").trim().toLowerCase();

  if (role === SIDEBAR_ROLE_ADMIN) return SIDEBAR_ROLE_ADMIN;
  if (role === SIDEBAR_ROLE_USER) return SIDEBAR_ROLE_USER;

  return "";
}

function firstRole(values = [], fallback = "") {
  for (const value of values) {
    const role = normalizeRoleValue(value);

    if (role) return role;
  }

  return fallback;
}

function getRoleFromAuth(Auth = null) {
  if (!isObject(Auth)) return "";

  return firstRole([
    safeCall(Auth.getRole?.bind?.(Auth) || Auth.getRole),
    safeCall(Auth.getCurrentRole?.bind?.(Auth) || Auth.getCurrentRole),
    Auth.role,
    Auth.currentRole,
    Auth.user?.role,
    Auth.user?.rol,
    Auth.user?.roles,
    Auth.currentUser?.role,
    Auth.currentUser?.rol,
    Auth.currentUser?.roles,
    Auth.session?.user?.role,
    Auth.session?.user?.rol,
    Auth.session?.user?.roles,
  ]);
}

export function getSidebarUserRole(context = {}) {
  const user =
    unwrapSidebarUser(context.user) ||
    getSidebarUserSource(context) ||
    null;

  const AppCore = context.AppCore || null;
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  return firstRole(
    [
      context.role,
      context.roles,

      user?.role,
      user?.rol,
      user?.roles,

      getRoleFromAuth(context.Auth),

      state.role,
      state.rol,
      state.roles,

      state.user?.role,
      state.user?.rol,
      state.user?.roles,

      state.currentUser?.role,
      state.currentUser?.rol,
      state.currentUser?.roles,

      state.auth?.user?.role,
      state.auth?.user?.rol,
      state.auth?.user?.roles,
    ],
    SIDEBAR_ROLE_USER
  );
}

export function isSidebarAdmin(context = {}) {
  return getSidebarUserRole(context) === SIDEBAR_ROLE_ADMIN;
}

/* =========================================================
   DISPLAY
========================================================= */

export function getSidebarDisplayName(user = null) {
  if (!isUsableSidebarUser(user)) return DEFAULT_NAME;

  const profile = isObject(user.profile) ? user.profile : {};
  const contacto = isObject(user.contacto) ? user.contacto : {};

  return limitText(
    first(
      user.displayName,
      user.fullName,
      user.name,
      user.nombre,

      profile.publicName,
      profile.displayName,
      profile.fullName,
      profile.name,
      profile.nombre,

      contacto.displayName,
      contacto.name,
      contacto.nombre,

      user.username,
      user.userName,
      getSidebarUserSlug(user)
    ),
    MAX_NAME_LENGTH
  ) || DEFAULT_NAME;
}

export function getSidebarUsername(user = null) {
  if (!isUsableSidebarUser(user)) return "";

  const raw = limitText(
    first(
      user.username,
      user.userName,
      user.user_name,
      user.usernameLower,
      user.username_lower,
      getSidebarUserSlug(user)
    ),
    MAX_USERNAME_LENGTH
  );

  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

export function getSidebarUserEmail(user = null) {
  if (!isUsableSidebarUser(user)) return "";

  const profile = isObject(user.profile) ? user.profile : {};
  const lookup = isObject(user.lookup) ? user.lookup : {};
  const contacto = isObject(user.contacto) ? user.contacto : {};

  const email = limitText(
    first(
      user.email,
      user.mail,
      user.emailAddress,
      user.emailLower,
      user.email_lower,

      profile.email,
      profile.mail,

      contacto.email,
      contacto.emailLower,

      lookup.email,
      lookup.emailLower,
      lookup.email_lower
    ),
    MAX_EMAIL_LENGTH
  ).toLowerCase();

  if (!email || email.length > MAX_EMAIL_LENGTH || /\s/.test(email)) return "";

  return email;
}

/* =========================================================
   AVATAR
========================================================= */

function avatarObjectValue(value = null) {
  if (!isObject(value)) return "";

  return first(
    value.url,
    value.href,
    value.src,
    value.path,
    value.publicUrl,
    value.publicURL,
    value.public_url,
    ""
  );
}

function safeAvatarUrl(value = "") {
  const avatar = limitText(stringText(value, ""), MAX_AVATAR_URL_LENGTH);

  if (!avatar) return "";
  if (/[\r\n\t]/.test(avatar)) return "";
  if (/^\/\//.test(avatar)) return "";
  if (hasSensitiveQuery(avatar)) return "";
  if (/^(?:data|blob|javascript|vbscript|file):/i.test(avatar)) return "";

  /*
    Caso 1: path interno canónico.
  */
  if (avatar.startsWith("/")) {
    return avatar.replace(/\/{2,}/g, "/");
  }

  /*
    Caso 2: URL absoluta.
    - https externa: se permite
    - same-origin/local dev: se convierte a path interno para que template.js la pinte
    - http externa: se bloquea
  */
  if (/^https?:\/\//i.test(avatar)) {
    try {
      const url = new URL(avatar);
      const pathOnly = `${url.pathname || ""}${url.search || ""}${url.hash || ""}` || "/";
      const sameOrigin = isBrowser() && url.origin === window.location.origin;
      const localDev = isLocalDevHost(url.hostname);

      if (url.protocol === "https:") {
        if (sameOrigin || localDev) {
          return pathOnly.replace(/\/{2,}/g, "/");
        }

        return url.href;
      }

      if (url.protocol === "http:") {
        if (sameOrigin || localDev) {
          return pathOnly.replace(/\/{2,}/g, "/");
        }

        return "";
      }

      return "";
    } catch {
      return "";
    }
  }

  /*
    Caso 3: ruta relativa tipo:
      uploads/avatar.jpg
      media/img/users/a.png
      ./uploads/avatar.webp
  */
  if (
    avatar.includes("/") ||
    /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i.test(avatar)
  ) {
    return normalizeInternalAssetPath(avatar);
  }

  return "";
}

export function getSidebarUserAvatarUrl(user = null) {
  if (!isUsableSidebarUser(user)) return "";

  const profile = isObject(user.profile) ? user.profile : {};
  const raw = isObject(user.raw) ? user.raw : {};
  const preferences = isObject(user.preferences) ? user.preferences : {};
  const media = isObject(user.media) ? user.media : {};

  const userAvatarObject = isObject(user.avatar) ? user.avatar : {};
  const userPhotoObject = isObject(user.photo) ? user.photo : {};
  const userPictureObject = isObject(user.picture) ? user.picture : {};
  const userImageObject = isObject(user.image) ? user.image : {};

  const profileAvatarObject = isObject(profile.avatar) ? profile.avatar : {};
  const profilePhotoObject = isObject(profile.photo) ? profile.photo : {};
  const profilePictureObject = isObject(profile.picture) ? profile.picture : {};
  const profileImageObject = isObject(profile.image) ? profile.image : {};

  const mediaAvatarObject = isObject(media.avatar) ? media.avatar : {};
  const mediaPhotoObject = isObject(media.photo) ? media.photo : {};
  const mediaPictureObject = isObject(media.picture) ? media.picture : {};
  const mediaImageObject = isObject(media.image) ? media.image : {};

  const preferencesAvatarObject = isObject(preferences.avatar) ? preferences.avatar : {};

  const rawAvatarObject = isObject(raw.avatar) ? raw.avatar : {};
  const rawPhotoObject = isObject(raw.photo) ? raw.photo : {};
  const rawPictureObject = isObject(raw.picture) ? raw.picture : {};
  const rawImageObject = isObject(raw.image) ? raw.image : {};

  /*
    hasAvatar es sólo una señal.
    La URL real debe venir en avatar/avatarUrl/photo/picture/image o variantes seguras.
  */
  return safeAvatarUrl(
    first(
      user.avatarUrl,
      user.avatarURL,
      user.avatar_url,
      typeof user.avatar === "string" ? user.avatar : "",
      avatarObjectValue(userAvatarObject),

      user.photoUrl,
      user.photoURL,
      user.photo_url,
      typeof user.photo === "string" ? user.photo : "",
      avatarObjectValue(userPhotoObject),

      user.pictureUrl,
      user.pictureURL,
      user.picture_url,
      typeof user.picture === "string" ? user.picture : "",
      avatarObjectValue(userPictureObject),

      user.imageUrl,
      user.imageURL,
      user.image_url,
      typeof user.image === "string" ? user.image : "",
      avatarObjectValue(userImageObject),

      user.img,
      user.imgUrl,
      user.imgURL,

      profile.avatarUrl,
      profile.avatarURL,
      profile.avatar_url,
      typeof profile.avatar === "string" ? profile.avatar : "",
      avatarObjectValue(profileAvatarObject),

      profile.photoUrl,
      profile.photoURL,
      profile.photo_url,
      typeof profile.photo === "string" ? profile.photo : "",
      avatarObjectValue(profilePhotoObject),

      profile.pictureUrl,
      profile.pictureURL,
      profile.picture_url,
      typeof profile.picture === "string" ? profile.picture : "",
      avatarObjectValue(profilePictureObject),

      profile.imageUrl,
      profile.imageURL,
      profile.image_url,
      typeof profile.image === "string" ? profile.image : "",
      avatarObjectValue(profileImageObject),

      media.avatarUrl,
      media.avatarURL,
      media.avatar_url,
      typeof media.avatar === "string" ? media.avatar : "",
      avatarObjectValue(mediaAvatarObject),

      media.photoUrl,
      media.photoURL,
      media.photo_url,
      typeof media.photo === "string" ? media.photo : "",
      avatarObjectValue(mediaPhotoObject),

      media.pictureUrl,
      media.pictureURL,
      media.picture_url,
      typeof media.picture === "string" ? media.picture : "",
      avatarObjectValue(mediaPictureObject),

      media.imageUrl,
      media.imageURL,
      media.image_url,
      typeof media.image === "string" ? media.image : "",
      avatarObjectValue(mediaImageObject),

      preferences.avatarUrl,
      preferences.avatarURL,
      preferences.avatar_url,
      typeof preferences.avatar === "string" ? preferences.avatar : "",
      avatarObjectValue(preferencesAvatarObject),

      raw.avatarUrl,
      raw.avatarURL,
      raw.avatar_url,
      typeof raw.avatar === "string" ? raw.avatar : "",
      avatarObjectValue(rawAvatarObject),

      raw.photoUrl,
      raw.photoURL,
      raw.photo_url,
      typeof raw.photo === "string" ? raw.photo : "",
      avatarObjectValue(rawPhotoObject),

      raw.pictureUrl,
      raw.pictureURL,
      raw.picture_url,
      typeof raw.picture === "string" ? raw.picture : "",
      avatarObjectValue(rawPictureObject),

      raw.imageUrl,
      raw.imageURL,
      raw.image_url,
      typeof raw.image === "string" ? raw.image : "",
      avatarObjectValue(rawImageObject)
    )
  );
}

export function getSidebarInitials(value = "") {
  const name = text(value, DEFAULT_NAME);
  const parts = name.split(/\s+/).filter(Boolean);

  if (!parts.length) return DEFAULT_INITIALS;

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase() || DEFAULT_INITIALS;
  }

  const firstInitial = parts[0]?.[0] || "";
  const lastInitial = parts[parts.length - 1]?.[0] || "";

  return `${firstInitial}${lastInitial}`.toUpperCase() || DEFAULT_INITIALS;
}

export function getSidebarRoleLabel(role = SIDEBAR_ROLE_USER) {
  return role === SIDEBAR_ROLE_ADMIN ? ROLE_LABEL_ADMIN : ROLE_LABEL_STANDARD;
}

/* =========================================================
   VIEW MODEL
========================================================= */

export function getSidebarUser(context = {}) {
  const user = getSidebarUserSource(context);
  const hasUser = isUsableSidebarUser(user);

  const displayName = hasUser
    ? getSidebarDisplayName(user)
    : DEFAULT_NAME;

  const role = hasUser
    ? getSidebarUserRole({
        ...context,
        user,
      })
    : SIDEBAR_ROLE_USER;

  const id = hasUser
    ? text(first(user.id, user.userId, user.uid, user.sub, ""), "")
    : "";

  const userId = hasUser
    ? text(first(user.userId, user.id, user.uid, user.sub, ""), "")
    : "";

  const slug = hasUser ? getSidebarUserSlug(user) : "";
  const username = hasUser ? getSidebarUsername(user) : "";
  const email = hasUser ? getSidebarUserEmail(user) : "";
  const avatarUrl = hasUser ? getSidebarUserAvatarUrl(user) : "";
  const initials = getSidebarInitials(displayName);
  const roleLabel = getSidebarRoleLabel(role);

  return {
    hasUser,

    id: id || null,
    userId: userId || null,
    slug: slug || null,

    displayName,
    name: displayName,
    fullName: displayName,

    username,

    email,

    hasAvatar: Boolean(avatarUrl),
    avatarUrl,
    avatar: avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,

    initials,

    role,
    rol: role,
    roles: [role],
    roleLabel,

    isAdmin: role === SIDEBAR_ROLE_ADMIN,
    isUser: role === SIDEBAR_ROLE_USER,
  };
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getSidebarUserSnapshot(context = {}) {
  const user = getSidebarUser(context);

  return {
    version: SIDEBAR_USER_VERSION,

    hasUser: user.hasUser,

    user: user.hasUser
      ? {
          hasId: Boolean(user.id || user.userId),
          username: user.username || null,
          slug: user.slug || null,
          displayName: user.displayName,
          hasEmail: Boolean(user.email),
          hasAvatar: Boolean(user.avatarUrl),
          avatarUrl: user.avatarUrl || null,
          initials: user.initials,
          role: user.role,
          roleLabel: user.roleLabel,
        }
      : null,

    isAdmin: user.isAdmin,

    policy: {
      viewModelOnly: true,

      noDom: true,
      noEvents: true,
      noStorage: true,
      noHttp: true,
      noDropdownBehavior: true,

      noPermissionsInvented: true,

      noEmailIdentity: true,
      noSlugFabrication: true,

      roleLabels: {
        admin: ROLE_LABEL_ADMIN,
        user: ROLE_LABEL_STANDARD,
      },

      avatarContract: {
        rootAvatar: true,
        rootAvatarUrl: true,
        rootHasAvatarSignalOnly: true,
        hasAvatarDoesNotCreateUrl: true,
      },

      avatarInternalOrHttpsOnly: true,
      avatarSameOriginAbsoluteSupported: true,
      avatarLocalhostAbsoluteSupported: true,
      avatarRelativePathSupported: true,
      avatarObjectUrlSupported: true,
      noSensitiveAvatarQuery: true,
      noBlobAvatar: true,
      noDataImageAvatar: true,
      noExternalHttpAvatar: true,

      roles: [SIDEBAR_ROLE_ADMIN, SIDEBAR_ROLE_USER],
    },
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_USER_VERSION,

  normalizeSidebarUserSlug,
  getSidebarUserSlug,

  isSidebarUserDisabled,
  hasSidebarUserIdentity,
  isUsableSidebarUser,
  unwrapSidebarUser,

  getSidebarUserSource,
  getSidebarUserRole,
  isSidebarAdmin,

  getSidebarDisplayName,
  getSidebarUsername,
  getSidebarUserEmail,
  getSidebarUserAvatarUrl,
  getSidebarInitials,
  getSidebarRoleLabel,

  getSidebarUser,
  getSidebarUserSnapshot,
};

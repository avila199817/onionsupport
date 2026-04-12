/* =========================================================
   Onion SPA - Auth Normalize
   Archivo: src/features/auth/normalize.js

   Responsabilidades:
   - normalizar user heterogéneo backend
   - normalizar payload de sesión
   - extraer tokens desde respuestas variables
   - validar respuesta de login / refresh
   - normalizar avatar robusto para sidebar / topbar
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  sanitizeUsername,
  slugify,
  safeClone,
  normalizeSessionValue,
} from "./helpers.js";

import { AUTH_CONSTANTS } from "./constants.js";

/* =========================================================
   HELPERS
========================================================= */
function normalizeString(value = "") {
  return String(value ?? "").trim();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return fallback;
}

function normalizeAvatarUrl(rawUser = null) {
  if (!rawUser || typeof rawUser !== "object") {
    return null;
  }

  const hasAvatar =
    rawUser.hasAvatar ??
    rawUser.has_avatar ??
    rawUser.avatarEnabled ??
    rawUser.avatar_enabled;

  const rawAvatar =
    rawUser.avatar ??
    rawUser.avatarUrl ??
    rawUser.avatar_url ??
    rawUser.photo ??
    rawUser.photoUrl ??
    rawUser.photo_url ??
    rawUser.image ??
    rawUser.imageUrl ??
    rawUser.image_url ??
    rawUser.picture ??
    rawUser.pictureUrl ??
    rawUser.picture_url ??
    null;

  const avatar = normalizeString(rawAvatar);

  if (!avatar) {
    return null;
  }

  if (hasAvatar !== undefined && !normalizeBoolean(hasAvatar, false)) {
    return null;
  }

  return avatar;
}

/* =========================================================
   USER
========================================================= */
export function normalizeUser(
  rawUser = null
) {
  if (
    typeof AppCore.normalizeUser ===
    "function"
  ) {
    const normalizedByCore =
      AppCore.normalizeUser(
        rawUser
      );

    if (normalizedByCore) {
      return normalizedByCore;
    }
  }

  if (
    !rawUser ||
    typeof rawUser !== "object"
  ) {
    return null;
  }

  const username = sanitizeUsername(
    rawUser.username ??
      rawUser.userName ??
      rawUser.nick ??
      rawUser.alias ??
      rawUser.login ??
      rawUser.slug ??
      ""
  );

  const displayName =
    rawUser.name ??
    rawUser.nombre ??
    rawUser.full_name ??
    rawUser.fullName ??
    rawUser.display_name ??
    rawUser.displayName ??
    rawUser.username ??
    rawUser.email ??
    "Usuario";

  const role =
    rawUser.role ??
    rawUser.rol ??
    rawUser.type ??
    rawUser.user_type ??
    rawUser.userType ??
    "user";

  const userSlug =
    rawUser.slug ??
    slugify(
      username ||
        displayName ||
        "usuario"
    );

  const avatar =
    normalizeAvatarUrl(rawUser);

  return {
    id:
      rawUser.id ??
      rawUser.userId ??
      rawUser.user_id ??
      rawUser.uuid ??
      rawUser._id ??
      null,

    userId:
      rawUser.userId ??
      rawUser.id ??
      rawUser.user_id ??
      rawUser.uuid ??
      rawUser._id ??
      null,

    username,
    slug: userSlug,

    name: displayName,

    email:
      rawUser.email ??
      rawUser.mail ??
      "",

    phone:
      rawUser.phone ??
      rawUser.telefono ??
      rawUser.mobile ??
      rawUser.cellphone ??
      null,

    role,

    permissions:
      Array.isArray(
        rawUser.permissions
      )
        ? rawUser.permissions
        : [],

    clienteId:
      rawUser.clienteId ??
      rawUser.clientId ??
      rawUser.cliente_id ??
      null,

    privacyMode: normalizeBoolean(
      rawUser.privacyMode ??
        rawUser.privacy_mode,
      false
    ),

    hasAvatar: Boolean(avatar),
    avatar,
    avatarUpdatedAt:
      rawUser.avatarUpdatedAt ??
      rawUser.avatar_updated_at ??
      null,

    active: normalizeBoolean(
      rawUser.active ??
        rawUser.is_active ??
        rawUser.isActive,
      true
    ),

    darkMode: normalizeBoolean(
      rawUser.darkMode ??
        rawUser.dark_mode,
      false
    ),

    emailVerified: normalizeBoolean(
      rawUser.emailVerified ??
        rawUser.email_verified,
      false
    ),

    twofa_enabled: normalizeBoolean(
      rawUser.twofa_enabled ??
        rawUser.twofaEnabled,
      false
    ),

    raw: safeClone(rawUser),
  };
}

/* =========================================================
   SESSION PAYLOAD
========================================================= */
export function normalizeSessionPayload(
  payload = null
) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const sessionNode =
    payload.session ??
    payload.data?.session ??
    payload.meta?.session ??
    null;

  if (!sessionNode || typeof sessionNode !== "object") {
    return null;
  }

  const sessionId = normalizeSessionValue(
    sessionNode.sessionId ??
      sessionNode.id ??
      "",
    AUTH_CONSTANTS.sessionValueMaxLength
  );

  const userId = normalizeSessionValue(
    sessionNode.userId ??
      payload.user?.userId ??
      payload.user?.id ??
      payload.data?.user?.userId ??
      payload.data?.user?.id ??
      "",
    AUTH_CONSTANTS.sessionValueMaxLength
  );

  return {
    sessionId: sessionId || null,
    userId: userId || null,
    expiresAt:
      sessionNode.expiresAt ??
      null,
    createdAt:
      sessionNode.createdAt ??
      null,
    lastActiveAt:
      sessionNode.lastActiveAt ??
      null,
    lastRefreshAt:
      sessionNode.lastRefreshAt ??
      null,
  };
}

/* =========================================================
   TOKEN EXTRACTORS
========================================================= */
export function extractToken(
  payload = null
) {
  if (!payload) return null;

  return (
    payload.token ??
    payload.access_token ??
    payload.accessToken ??
    payload.jwt ??
    payload.id_token ??
    payload.data?.token ??
    payload.data?.access_token ??
    payload.data?.accessToken ??
    payload.data?.jwt ??
    payload.meta?.token ??
    null
  );
}

export function extractRefreshToken(
  payload = null
) {
  if (!payload) return null;

  return (
    payload.refresh_token ??
    payload.refreshToken ??
    payload.data?.refresh_token ??
    payload.data?.refreshToken ??
    payload.meta?.refreshToken ??
    payload.meta?.refresh_token ??
    null
  );
}

export function extractTempToken(
  payload = null
) {
  if (!payload) return null;

  return (
    payload.tempToken ??
    payload.temp_token ??
    payload.data?.tempToken ??
    payload.data?.temp_token ??
    payload.meta?.tempToken ??
    payload.meta?.temp_token ??
    null
  );
}

export function extractRequires2FA(
  payload = null
) {
  if (!payload) return false;

  return Boolean(
    payload.requires2FA ??
      payload.requires_2fa ??
      payload.requiresTwoFactor ??
      payload.data?.requires2FA ??
      payload.data?.requires_2fa ??
      payload.data?.requiresTwoFactor
  );
}

/* =========================================================
   USER EXTRACTOR
========================================================= */
export function extractUser(
  payload = null
) {
  if (!payload) return null;

  return normalizeUser(
    payload.user ??
      payload.data?.user ??
      payload.me ??
      payload.data?.me ??
      payload.profile ??
      payload.data?.profile ??
      payload.account ??
      payload.data?.account ??
      null
  );
}

/* =========================================================
   AUTH RESPONSE VALIDATION
========================================================= */
export function validateAuthResponse(
  response = null
) {
  const token = extractToken(response);
  const user = extractUser(response);
  const refreshToken =
    extractRefreshToken(response);
  const requires2FA =
    extractRequires2FA(response);
  const tempToken =
    extractTempToken(response);
  const sessionData =
    normalizeSessionPayload(
      response
    );

  if (requires2FA && tempToken) {
    return {
      status: "2fa_required",
      token: null,
      user: null,
      refreshToken: null,
      sessionData: null,
      tempToken,
      response,
    };
  }

  if (!token && !user) {
    throw new Error(
      "La respuesta del API no contiene una sesión válida."
    );
  }

  return {
    status: "authenticated",
    token,
    user,
    refreshToken,
    sessionData,
    tempToken: null,
    response,
  };
}

/* =========================================================
   Onion SPA - Auth Normalize
   Archivo: src/features/auth/normalize.js

   Responsabilidades:
   - normalizar user heterogéneo backend
   - normalizar payload de sesión
   - extraer tokens desde respuestas variables
   - validar respuesta de login / refresh
   - normalizar avatar robusto para sidebar / topbar
   - endurecer tipos / strings / arrays
   - detectar 2FA con variantes comunes
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

function safeLower(value = "") {
  return normalizeString(value).toLowerCase();
}

function normalizeBoolean(
  value,
  fallback = false
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (
    value === 1 ||
    value === "1" ||
    value === "true" ||
    value === "yes" ||
    value === "on"
  ) {
    return true;
  }

  if (
    value === 0 ||
    value === "0" ||
    value === "false" ||
    value === "no" ||
    value === "off"
  ) {
    return false;
  }

  return fallback;
}

function normalizeArray(value) {
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [];
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function pickFirst(...values) {
  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return null;
}

function normalizeEmail(value = "") {
  return safeLower(value);
}

function normalizeRole(value = "user") {
  return (
    safeLower(value) ||
    "user"
  );
}

function normalizeAvatarUrl(
  rawUser = null
) {
  if (!isObject(rawUser)) {
    return null;
  }

  const hasAvatar =
    rawUser.hasAvatar ??
    rawUser.has_avatar ??
    rawUser.avatarEnabled ??
    rawUser.avatar_enabled;

  const rawAvatar =
    pickFirst(
      rawUser.avatar,
      rawUser.avatarUrl,
      rawUser.avatar_url,
      rawUser.photo,
      rawUser.photoUrl,
      rawUser.photo_url,
      rawUser.image,
      rawUser.imageUrl,
      rawUser.image_url,
      rawUser.picture,
      rawUser.pictureUrl,
      rawUser.picture_url
    );

  const avatar =
    normalizeString(rawAvatar);

  if (!avatar) {
    return null;
  }

  if (
    hasAvatar !== undefined &&
    !normalizeBoolean(
      hasAvatar,
      false
    )
  ) {
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
  try {
    if (
      typeof AppCore?.normalizeUser ===
      "function"
    ) {
      const external =
        AppCore.normalizeUser(
          rawUser
        );

      if (external) {
        return external;
      }
    }
  } catch {}

  if (!isObject(rawUser)) {
    return null;
  }

  const username =
    sanitizeUsername(
      pickFirst(
        rawUser.username,
        rawUser.userName,
        rawUser.nick,
        rawUser.alias,
        rawUser.login,
        rawUser.slug,
        rawUser.email
      ) || ""
    );

  const displayName =
    normalizeString(
      pickFirst(
        rawUser.name,
        rawUser.nombre,
        rawUser.full_name,
        rawUser.fullName,
        rawUser.display_name,
        rawUser.displayName,
        rawUser.username,
        rawUser.email,
        "Usuario"
      )
    );

  const role =
    normalizeRole(
      pickFirst(
        rawUser.role,
        rawUser.rol,
        rawUser.type,
        rawUser.user_type,
        rawUser.userType,
        "user"
      )
    );

  const slug =
    normalizeString(
      pickFirst(
        rawUser.slug,
        slugify(
          username ||
          displayName ||
          "usuario"
        )
      )
    );

  const email =
    normalizeEmail(
      pickFirst(
        rawUser.email,
        rawUser.mail,
        ""
      )
    );

  const avatar =
    normalizeAvatarUrl(
      rawUser
    );

  const id =
    pickFirst(
      rawUser.id,
      rawUser.userId,
      rawUser.user_id,
      rawUser.uuid,
      rawUser._id
    );

  const userId =
    pickFirst(
      rawUser.userId,
      rawUser.id,
      rawUser.user_id,
      rawUser.uuid,
      rawUser._id
    );

  return {
    id: id || null,
    userId:
      userId || null,

    username,
    slug,

    name:
      displayName ||
      "Usuario",

    email,

    phone:
      pickFirst(
        rawUser.phone,
        rawUser.telefono,
        rawUser.mobile,
        rawUser.cellphone
      ) || null,

    role,

    permissions:
      normalizeArray(
        rawUser.permissions
      ),

    clienteId:
      pickFirst(
        rawUser.clienteId,
        rawUser.clientId,
        rawUser.cliente_id
      ) || null,

    privacyMode:
      normalizeBoolean(
        rawUser.privacyMode ??
        rawUser.privacy_mode,
        false
      ),

    hasAvatar:
      Boolean(avatar),

    avatar,

    avatarUpdatedAt:
      pickFirst(
        rawUser.avatarUpdatedAt,
        rawUser.avatar_updated_at
      ) || null,

    active:
      normalizeBoolean(
        rawUser.active ??
        rawUser.is_active ??
        rawUser.isActive,
        true
      ),

    darkMode:
      normalizeBoolean(
        rawUser.darkMode ??
        rawUser.dark_mode,
        false
      ),

    emailVerified:
      normalizeBoolean(
        rawUser.emailVerified ??
        rawUser.email_verified,
        false
      ),

    twofa_enabled:
      normalizeBoolean(
        rawUser.twofa_enabled ??
        rawUser.twofaEnabled ??
        rawUser.twoFactorEnabled,
        false
      ),

    raw:
      safeClone(rawUser),
  };
}

/* =========================================================
   SESSION PAYLOAD
========================================================= */

export function normalizeSessionPayload(
  payload = null
) {
  if (!isObject(payload)) {
    return null;
  }

  const sessionNode =
    payload.session ??
    payload.data?.session ??
    payload.meta?.session ??
    null;

  if (!isObject(sessionNode)) {
    return null;
  }

  const max =
    AUTH_CONSTANTS
      ?.sessionValueMaxLength ||
    200;

  const sessionId =
    normalizeSessionValue(
      pickFirst(
        sessionNode.sessionId,
        sessionNode.id
      ) || "",
      max
    );

  const userId =
    normalizeSessionValue(
      pickFirst(
        sessionNode.userId,
        payload.user?.userId,
        payload.user?.id,
        payload.data?.user?.userId,
        payload.data?.user?.id
      ) || "",
      max
    );

  return {
    sessionId:
      sessionId || null,

    userId:
      userId || null,

    expiresAt:
      pickFirst(
        sessionNode.expiresAt,
        sessionNode.expires_at
      ) || null,

    createdAt:
      pickFirst(
        sessionNode.createdAt,
        sessionNode.created_at
      ) || null,

    lastActiveAt:
      pickFirst(
        sessionNode.lastActiveAt,
        sessionNode.last_active_at
      ) || null,

    lastRefreshAt:
      pickFirst(
        sessionNode.lastRefreshAt,
        sessionNode.last_refresh_at
      ) || null,
  };
}

/* =========================================================
   TOKEN EXTRACTORS
========================================================= */

export function extractToken(
  payload = null
) {
  if (!payload) {
    return null;
  }

  return (
    pickFirst(
      payload.token,
      payload.access_token,
      payload.accessToken,
      payload.jwt,
      payload.id_token,
      payload.data?.token,
      payload.data?.access_token,
      payload.data?.accessToken,
      payload.data?.jwt,
      payload.meta?.token
    ) || null
  );
}

export function extractRefreshToken(
  payload = null
) {
  if (!payload) {
    return null;
  }

  return (
    pickFirst(
      payload.refresh_token,
      payload.refreshToken,
      payload.data?.refresh_token,
      payload.data?.refreshToken,
      payload.meta?.refreshToken,
      payload.meta?.refresh_token
    ) || null
  );
}

export function extractTempToken(
  payload = null
) {
  if (!payload) {
    return null;
  }

  return (
    pickFirst(
      payload.tempToken,
      payload.temp_token,
      payload.challengeToken,
      payload.data?.tempToken,
      payload.data?.temp_token,
      payload.meta?.tempToken
    ) || null
  );
}

export function extractRequires2FA(
  payload = null
) {
  if (!payload) {
    return false;
  }

  const status =
    safeLower(
      pickFirst(
        payload.status,
        payload.data?.status
      ) || ""
    );

  if (
    status ===
      "2fa_required" ||
    status ===
      "mfa_required"
  ) {
    return true;
  }

  return Boolean(
    normalizeBoolean(
      payload.requires2FA ??
      payload.requires_2fa ??
      payload.requiresTwoFactor ??
      payload.requiresMfa ??
      payload.data?.requires2FA ??
      payload.data?.requires_2fa ??
      payload.data?.requiresTwoFactor,
      false
    )
  );
}

/* =========================================================
   USER EXTRACTOR
========================================================= */

export function extractUser(
  payload = null
) {
  if (!payload) {
    return null;
  }

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
  const token =
    extractToken(
      response
    );

  const user =
    extractUser(
      response
    );

  const refreshToken =
    extractRefreshToken(
      response
    );

  const requires2FA =
    extractRequires2FA(
      response
    );

  const tempToken =
    extractTempToken(
      response
    );

  const sessionData =
    normalizeSessionPayload(
      response
    );

  if (
    requires2FA &&
    tempToken
  ) {
    return {
      status:
        "2fa_required",
      token: null,
      user: null,
      refreshToken:
        null,
      sessionData:
        null,
      tempToken,
      response,
    };
  }

  if (
    !token &&
    !user
  ) {
    throw new Error(
      "La respuesta del API no contiene una sesión válida."
    );
  }

  return {
    status:
      "authenticated",
    token:
      token || null,
    user:
      user || null,
    refreshToken:
      refreshToken ||
      null,
    sessionData:
      sessionData ||
      null,
    tempToken: null,
    response,
  };
}

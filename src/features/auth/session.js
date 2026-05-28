/* =========================================================
   Onion Support - Auth Session
   Archivo: /src/features/auth/session.js

   Responsabilidad:
   - Núcleo local mínimo de sesión Auth.
   - Auth estricta: access token usable + user usable.
   - Token sin user: hasToken true, authenticated false.
   - User sin token: authenticated false.
   - User inválido sólo por:
     - disabled === true
     - suspended === true
     - active === false
     - enabled === false
     - status/estado/state: "suspended" o "desactivado"
   - Roles únicos: admin / user.
   - Leer access token persistido para soportar reload.
   - Leer refresh token persistido si existe por compat.
   - Soportar restore con cookie httpOnly aunque no haya refresh token visible.
   - Persistir access/refresh/session auxiliar al aplicar sesión.
   - Refresh token nunca en AppCore.state ni snapshots.
   - Preservar campos públicos visuales del usuario: avatar/avatarUrl/picture/photoUrl/hasAvatar.
   - No fabricar user desde storage.
   - No persistir user completo como fuente de autenticación.
   - No arrastrar refresh/session de otro usuario.
   - Conservar slug real del usuario si existe.
   - Exponer homePath: /@{user.slug} sólo si el usuario trae slug real.
   - Exportar normalizeSessionContext como API pública mínima para módulos Auth.
   - Sin fetch.
   - Sin login HTTP.
   - Sin refresh HTTP.
   - Sin Router.
   - Sin Toast.
   - Sin storage paralelo fuera de storage.js.
   - Sin eventos globales.
   - Sin 2FA/MFA/OTP.
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  USER_HOME_PREFIX,
} from "../../core/config.js";

import {
  clearAuthStorage,
  getStoredAccessToken,
  getStoredRefreshToken,
  getStoredSessionContext,
  persistAuthStorage,
} from "./storage.js";

export const AUTH_SESSION_VERSION = "auth.session.v11";

const SOURCE = "auth.session";

const AUTH_HOME = Object.freeze({
  canonical: "/",
  userPrefix: USER_HOME_PREFIX || "/@",
});

const VALID_ROLES = Object.freeze(["admin", "user"]);

const INVALID_USER_STATUSES = new Set([
  "suspended",
  "desactivado",
]);

const SENSITIVE_USER_KEYS = new Set([
  "password",
  "passwordhash",
  "password_hash",
  "hash",
  "salt",
  "passwordmeta",

  "token",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "refreshtokenhash",
  "refresh_token_hash",
  "idtoken",
  "id_token",

  "resettoken",
  "reset_token",
  "activationtoken",
  "activation_token",

  "authorization",
  "authheader",

  "secret",
  "secrets",
  "code",
  "codes",
  "backupcodes",
  "backup_codes",

  "otp",
  "otpcode",
  "totp",
  "mfa",
  "twofa_secret",
  "twofasecret",
  "totpsecret",

  "sas",
  "connectionstring",
  "connection_string",

  "_rid",
  "_self",
  "_etag",
  "_attachments",
  "_ts",
  "_lsn",
  "_metadata",
]);

const USER_AVATAR_FIELDS = Object.freeze([
  "avatarUrl",
  "avatarURL",
  "avatar_url",
  "avatar",

  "photoUrl",
  "photoURL",
  "photo_url",
  "photo",

  "pictureUrl",
  "pictureURL",
  "picture_url",
  "picture",

  "imageUrl",
  "imageURL",
  "image_url",
  "image",

  "profileImage",
  "profile_image",

  "img",
  "imgUrl",
  "imgURL",

  "foto",
  "fotoUrl",
  "fotoURL",
  "foto_url",

  "imagen",
  "imagenUrl",
  "imagenURL",
  "imagen_url",
]);

const USER_AVATAR_OBJECTS = Object.freeze([
  "profile",
  "media",
  "preferences",
  "account",
  "me",
  "raw",
  "contacto",
]);

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeKey(value = "") {
  return cleanText(value, "").toLowerCase();
}

function firstText(...values) {
  for (const value of values) {
    const output = cleanText(value, "");

    if (output) return output;
  }

  return "";
}

function nowIso() {
  try {
    return new Date().toISOString();
  } catch {
    return "";
  }
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   ROLE / TOKEN
========================================================= */

function normalizeRole(value = "") {
  if (Array.isArray(value)) {
    const roles = value.map(normalizeRole).filter(Boolean);

    if (roles.includes("admin")) return "admin";
    if (roles.includes("user")) return "user";

    return "";
  }

  const role = cleanText(value, "").toLowerCase();

  return VALID_ROLES.includes(role) ? role : "";
}

function cleanRole(value = "") {
  return normalizeRole(value) || "user";
}

function stripBearer(value = "") {
  return cleanText(value, "").replace(/^Bearer\s+/i, "");
}

function tokenOk(value = "") {
  const token = stripBearer(value);

  if (!token) return false;
  if (/\s/.test(token)) return false;
  if (token.length > 8192) return false;

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(token.toLowerCase());
}

function cleanToken(value = "") {
  const token = stripBearer(value);
  return tokenOk(token) ? token : "";
}

/* =========================================================
   STATE
========================================================= */

function ensureState() {
  try {
    AppCore.state = isObject(AppCore.state) ? AppCore.state : {};
    return AppCore.state;
  } catch {
    return {};
  }
}

function readState() {
  return isObject(AppCore?.state) ? AppCore.state : {};
}

function commitState(patch = {}, options = {}) {
  const cleanPatch = isObject(patch) ? patch : {};

  const opts = {
    source: options.source || SOURCE,
    silent: options.silent !== false,
    emit: false,
    forceUnauthenticated: options.forceUnauthenticated === true,
  };

  try {
    if (isFunction(AppCore?.setState)) {
      AppCore.setState(cleanPatch, opts);
      return readState();
    }
  } catch {
    // fallback abajo
  }

  try {
    if (isFunction(AppCore?.patchState)) {
      AppCore.patchState(cleanPatch, opts);
      return readState();
    }
  } catch {
    // fallback abajo
  }

  try {
    Object.assign(ensureState(), cleanPatch);
  } catch {
    // noop
  }

  return readState();
}

/* =========================================================
   SLUG / HOME
========================================================= */

export function normalizeSessionSlug(value = "") {
  const slug = cleanText(value, "")
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

export function extractSessionUserSlug(user = null) {
  if (!isObject(user)) return "";

  /*
    Slug real únicamente.
    No se inventa desde username/email/id.
  */
  return normalizeSessionSlug(
    user.slug ||
      user.lookup?.slug ||
      user.profile?.slug ||
      user.routing?.slug ||
      ""
  );
}

export function buildSessionUserHomePath(user = null) {
  const slug = extractSessionUserSlug(user);

  return slug ? `${AUTH_HOME.userPrefix}${slug}` : AUTH_HOME.canonical;
}

export function getCurrentUserSlug() {
  return extractSessionUserSlug(bestStateUser());
}

export function getCurrentUserHomePath() {
  return buildSessionUserHomePath(bestStateUser());
}

/* =========================================================
   USER VISUALS
========================================================= */

function avatarObjectValue(value = null) {
  if (!isObject(value)) return "";

  return firstText(
    value.url,
    value.href,
    value.src,
    value.path,
    value.publicUrl,
    value.publicURL,
    value.public_url,
    value.secureUrl,
    value.secureURL,
    value.secure_url,
    value.thumbnailUrl,
    value.thumbnailURL,
    value.thumbnail_url
  );
}

function avatarValueFromObject(source = null) {
  if (!isObject(source)) return "";

  for (const field of USER_AVATAR_FIELDS) {
    const value = source[field];

    if (typeof value === "string" || typeof value === "number") {
      const output = cleanText(value, "");

      if (output) return output;
    }

    if (isObject(value)) {
      const output = avatarObjectValue(value);

      if (output) return output;
    }
  }

  return "";
}

function resolveUserAvatar(...sources) {
  for (const source of sources) {
    if (!isObject(source)) continue;

    const direct = avatarValueFromObject(source);

    if (direct) return direct;

    for (const key of USER_AVATAR_OBJECTS) {
      const nested = source[key];

      if (!isObject(nested)) continue;

      const nestedAvatar = avatarValueFromObject(nested);

      if (nestedAvatar) return nestedAvatar;
    }
  }

  return "";
}

function resolveUserHasAvatar(...sources) {
  for (const source of sources) {
    if (!isObject(source)) continue;

    if (
      source.hasAvatar === true ||
      source.has_avatar === true ||
      source.avatarEnabled === true ||
      source.avatar_enabled === true ||
      source.profile?.avatarEnabled === true ||
      source.integrity?.hasAvatar === true ||
      source.meta?.hasAvatar === true
    ) {
      return true;
    }
  }

  return Boolean(resolveUserAvatar(...sources));
}

function mergeUserVisualFields(source = {}, normalized = {}) {
  if (!isObject(normalized)) return null;

  const avatar = resolveUserAvatar(normalized, source);
  const hasAvatar = resolveUserHasAvatar(normalized, source);
  const avatarUpdatedAt = firstText(
    normalized.avatarUpdatedAt,
    normalized.avatar_updated_at,
    source.avatarUpdatedAt,
    source.avatar_updated_at
  );

  return {
    ...normalized,

    hasAvatar: Boolean(hasAvatar || avatar),

    ...(avatar
      ? {
          avatar,
          avatarUrl: avatar,
          photoUrl: normalized.photoUrl || source.photoUrl || avatar,
          photoURL: normalized.photoURL || source.photoURL || avatar,
          picture: normalized.picture || source.picture || avatar,
          pictureUrl: normalized.pictureUrl || source.pictureUrl || avatar,
          image: normalized.image || source.image || avatar,
          imageUrl: normalized.imageUrl || source.imageUrl || avatar,
        }
      : {}),

    avatarUpdatedAt: avatarUpdatedAt || normalized.avatarUpdatedAt || source.avatarUpdatedAt || null,
  };
}

function userCandidateScore(user = null) {
  if (!isObject(user)) return -1;
  if (userDisabled(user)) return -1;

  let score = 0;

  if (cleanText(user.id || user.userId || user.uid || user.sub, "")) score += 20;
  if (cleanText(user.username || user.userName || user.user_name, "")) score += 10;
  if (extractSessionUserSlug(user)) score += 10;
  if (resolveUserAvatar(user)) score += 100;
  if (resolveUserHasAvatar(user)) score += 20;
  if (normalizeRole(user.role || user.rol || user.roles)) score += 10;
  if (cleanText(user.displayName || user.fullName || user.name || user.nombre, "")) score += 5;

  return score;
}

function selectBestUserCandidate(candidates = []) {
  let best = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    if (!isObject(candidate)) continue;

    const score = userCandidateScore(candidate);

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

/* =========================================================
   USER
========================================================= */

function isSensitiveUserKey(key = "") {
  return SENSITIVE_USER_KEYS.has(normalizeKey(key));
}

function sanitizeUserValue(value, keyHint = "", depth = 0) {
  if (depth > 8) return null;
  if (isSensitiveUserKey(keyHint)) return undefined;

  if (Array.isArray(value)) {
    return value
      .slice(0, 500)
      .map((item) => sanitizeUserValue(item, "", depth + 1))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveUserKey(key)) continue;

      const clean = sanitizeUserValue(item, key, depth + 1);

      if (clean !== undefined) {
        output[key] = clean;
      }
    }

    return output;
  }

  if (typeof value === "string") {
    return redact(value);
  }

  return value;
}

function removeSensitiveUserFields(user = {}) {
  return isObject(user) ? sanitizeUserValue(user) || {} : {};
}

function userDisabled(user = null) {
  if (!isObject(user)) return true;

  const status = cleanText(
    user.status ||
      user.estado ||
      user.state ||
      "",
    ""
  ).toLowerCase();

  return Boolean(
    user.disabled === true ||
      user.suspended === true ||
      user.active === false ||
      user.enabled === false ||
      INVALID_USER_STATUSES.has(status)
  );
}

function hasUserIdentity(user = null) {
  if (!isObject(user)) return false;

  return Boolean(
    cleanText(user.id, "") ||
      cleanText(user.userId, "") ||
      cleanText(user.uid, "") ||
      cleanText(user.sub, "") ||
      cleanText(user.username, "") ||
      cleanText(user.userName, "") ||
      cleanText(user.user_name, "") ||
      cleanText(user.slug, "") ||
      cleanText(user.lookup?.slug, "") ||
      cleanText(user.profile?.slug, "")
  );
}

export function normalizeUser(user = null) {
  if (!isObject(user)) return null;
  if (userDisabled(user)) return null;

  const appNormalized = isFunction(AppCore?.normalizeUser)
    ? AppCore.normalizeUser(user)
    : null;

  const safeUser = removeSensitiveUserFields(
    isObject(appNormalized) ? appNormalized : user
  );

  if (!isObject(safeUser)) return null;
  if (userDisabled(safeUser)) return null;
  if (!hasUserIdentity(safeUser)) return null;

  const id = cleanText(
    safeUser.userId ||
      safeUser.id ||
      safeUser.uid ||
      safeUser.sub,
    ""
  );

  /*
    Slug real únicamente.
    Se toma del objeto original recibido del backend.
    No se toma el slug que pueda fabricar AppCore desde username/id.
  */
  const slug = extractSessionUserSlug(user);

  const username = cleanText(
    safeUser.username ||
      safeUser.userName ||
      safeUser.user_name ||
      safeUser.usernameLower ||
      safeUser.username_lower ||
      "",
    ""
  );

  const profile = isObject(safeUser.profile) ? safeUser.profile : {};

  const displayName = cleanText(
    safeUser.displayName ||
      safeUser.fullName ||
      safeUser.name ||
      safeUser.nombre ||
      profile.displayName ||
      profile.fullName ||
      profile.name ||
      profile.nombre ||
      username ||
      id,
    "Usuario"
  );

  const role = cleanRole(safeUser.role || safeUser.rol || safeUser.roles);

  return mergeUserVisualFields(user, {
    ...safeUser,

    id: id || safeUser.id || safeUser.userId || null,
    userId: safeUser.userId || id || null,
    uid: safeUser.uid || id || null,
    sub: safeUser.sub || id || null,

    username: username || null,

    /*
      Slug real únicamente.
      No se inventa desde username/email/id.
    */
    slug: slug || null,

    name: safeUser.name || displayName,
    nombre: safeUser.nombre || displayName,
    fullName: safeUser.fullName || displayName,
    displayName,

    email: safeUser.email || null,

    role,
    rol: role,
    userRole: role,
    roles: [role],

    active: true,
    enabled: true,
    disabled: false,
    suspended: false,

    isAdmin: role === "admin",
    isUser: role === "user",
  });
}

/* =========================================================
   PAYLOAD READERS
========================================================= */

function nested(payload = {}) {
  const source = isObject(payload) ? payload : {};

  return [
    source,
    isObject(source.data) ? source.data : null,
    isObject(source.payload) ? source.payload : null,
    isObject(source.result) ? source.result : null,
    isObject(source.auth) ? source.auth : null,
    isObject(source.session) ? source.session : null,
    isObject(source.sessionData) ? source.sessionData : null,
  ].filter(Boolean);
}

function pick(nodes = [], keys = []) {
  for (const node of nodes) {
    for (const key of keys) {
      const value = node?.[key];

      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
  }

  return undefined;
}

function hasAuthEnvelopeSignals(value = null) {
  if (!isObject(value)) return false;

  return Boolean(
    value.token ||
      value.accessToken ||
      value.access_token ||
      value.refreshToken ||
      value.refresh_token ||
      value.session ||
      value.sessionData ||
      value.sessionId ||
      value.session_id ||
      value.sid ||
      value.sessionUserId ||
      value.session_user_id ||
      value.expiresAt ||
      value.expires_at ||
      value.auth ||
      value.payload ||
      value.result
  );
}

function looksLikeStandaloneUserObject(value = null) {
  if (!isObject(value)) return false;
  if (!hasUserIdentity(value)) return false;

  return !hasAuthEnvelopeSignals(value);
}

function readTokenFromPayload(payload = {}) {
  return cleanToken(
    pick(nested(payload), [
      "token",
      "accessToken",
      "access_token",
    ])
  );
}

function readRefreshTokenFromPayload(payload = {}) {
  return cleanToken(
    pick(nested(payload), [
      "refreshToken",
      "refresh_token",
    ])
  );
}

function payloadHasExplicitUser(payload = {}) {
  const nodes = nested(payload);

  for (const node of nodes) {
    if (
      isObject(node.user) ||
      isObject(node.usuario) ||
      isObject(node.me) ||
      isObject(node.account) ||
      isObject(node.profile)
    ) {
      return true;
    }
  }

  return looksLikeStandaloneUserObject(payload);
}

function readUserFromPayload(payload = {}) {
  const nodes = nested(payload);
  const candidates = [];

  for (const node of nodes) {
    const rawUser =
      node.user ||
      node.usuario ||
      node.me ||
      node.account ||
      node.profile ||
      null;

    if (!isObject(rawUser)) continue;

    /*
      Si el payload trae avatar en raíz y user reducido dentro,
      se conserva como fuente visual sin convertirlo en fuente de identidad.
    */
    candidates.push(
      mergeUserVisualFields(node, {
        ...rawUser,
      })
    );
  }

  const best = selectBestUserCandidate(candidates);

  if (best) return normalizeUser(best);

  return looksLikeStandaloneUserObject(payload)
    ? normalizeUser(payload)
    : null;
}

function sanitizeSessionContext(session = {}) {
  if (!isObject(session)) return null;

  const sessionId = cleanText(
    session.sessionId ||
      session.session_id ||
      session.sid ||
      session.id ||
      "",
    ""
  );

  const userId = cleanText(
    session.userId ||
      session.user_id ||
      session.uid ||
      session.sessionUserId ||
      session.session_user_id ||
      "",
    ""
  );

  const expiresAt =
    session.expiresAt ||
    session.expires_at ||
    session.refreshExpiresAt ||
    session.refresh_expires_at ||
    null;

  if (!sessionId && !userId && !expiresAt) return null;

  return {
    sessionId: sessionId || null,
    id: sessionId || null,
    sid: sessionId || null,

    userId: userId || null,
    sessionUserId: userId || null,

    expiresAt,
    refreshExpiresAt: session.refreshExpiresAt || session.refresh_expires_at || expiresAt,

    persistent: session.persistent === true,
    restoreOnBoot: session.restoreOnBoot === true,
    rollingRefresh: session.rollingRefresh === true,
    expiryEnforced: session.expiryEnforced === true,

    revoked: session.revoked === true,
    active: session.active !== false,
    status: session.status || session.estado || "active",

    tokenVersion: Number.isFinite(Number(session.tokenVersion))
      ? Number(session.tokenVersion)
      : undefined,
  };
}

export function normalizeSessionContext(value = null, _user = null) {
  return sanitizeSessionContext(value);
}

function readSessionFromPayload(payload = {}, user = null) {
  const nodes = nested(payload);

  const sessionNode =
    nodes.find((node) => isObject(node.session))?.session ||
    nodes.find((node) => isObject(node.sessionData))?.sessionData ||
    null;

  const directSession = sanitizeSessionContext(sessionNode);

  const fallbackSession = sanitizeSessionContext({
    sessionId:
      pick(nodes, ["sessionId", "session_id", "sid"]) ||
      "",
    userId:
      pick(nodes, ["sessionUserId", "session_user_id", "userId", "user_id"]) ||
      user?.userId ||
      user?.id ||
      user?.uid ||
      user?.sub ||
      "",
    expiresAt:
      pick(nodes, ["expiresAt", "expires_at", "refreshExpiresAt", "refresh_expires_at"]) ||
      null,
    persistent:
      pick(nodes, ["persistent"]) === true,
    restoreOnBoot:
      pick(nodes, ["restoreOnBoot"]) === true,
    rollingRefresh:
      pick(nodes, ["rollingRefresh"]) === true,
    expiryEnforced:
      pick(nodes, ["expiryEnforced"]) === true,
  });

  return directSession || fallbackSession;
}

/* =========================================================
   STORAGE DERIVATION
========================================================= */

function storedToken() {
  try {
    return cleanToken(getStoredAccessToken?.() || "");
  } catch {
    return "";
  }
}

function storedRefreshToken() {
  try {
    return cleanToken(getStoredRefreshToken?.() || "");
  } catch {
    return "";
  }
}

function storedSession() {
  try {
    const session = getStoredSessionContext?.();
    return sanitizeSessionContext(session);
  } catch {
    return null;
  }
}

/* =========================================================
   STATE DERIVATION
========================================================= */

function bestStateToken() {
  const state = readState();

  return cleanToken(
    state.token ||
      state.accessToken ||
      state.access_token ||
      storedToken() ||
      ""
  );
}

function bestStateRefreshToken() {
  /*
    El refresh token no debe vivir en AppCore.state.
    Se lee únicamente desde storage.js como contexto auxiliar de restore.
    Si el backend usa cookie httpOnly, puede no existir aquí y restore.js
    igualmente intentará /api/auth/refresh con credentials include.
  */
  return cleanToken(storedRefreshToken() || "");
}

function bestStateUser() {
  const state = readState();

  /*
    No se fabrica usuario desde storage.
    El reload se restaura así:
      token persistido -> restore.js -> /me -> user canónico.
      token caducado -> restore.js -> /refresh -> user canónico.
      sin token visible -> restore.js -> /refresh por cookie httpOnly si existe.

    Si hay varias copias del usuario en estado, se usa la más completa.
    Esto evita que una copia reducida sin avatar gane sobre otra con avatar.
  */
  const best = selectBestUserCandidate([
    state.user,
    state.currentUser,
    state.authUser,
    state.sessionUser,
    state.session?.user,
    state.sessionData?.user,
  ]);

  return normalizeUser(best);
}

function userIdentity(user = null) {
  if (!isObject(user)) return "";

  return cleanText(
    user.userId ||
      user.id ||
      user.uid ||
      user.sub ||
      extractSessionUserSlug(user) ||
      "",
    ""
  );
}

function sameUser(left = null, right = null) {
  const leftId = userIdentity(left);
  const rightId = userIdentity(right);

  if (!leftId || !rightId) return false;

  return leftId === rightId;
}

function sameSessionUser(session = null, user = null) {
  if (!session || !user) return false;

  const sessionUserId = cleanText(session.userId || session.sessionUserId, "");
  const userId = userIdentity(user);

  if (!sessionUserId || !userId) return true;

  return sessionUserId === userId;
}

function bestStateSession(user = bestStateUser()) {
  const state = readState();

  const session =
    readSessionFromPayload(state.session || {}, user) ||
    readSessionFromPayload(state.sessionData || {}, user) ||
    storedSession() ||
    null;

  if (!session) return null;
  if (!user) return session;

  return sameSessionUser(session, user) ? session : null;
}

function shouldKeepCurrentRefreshContext({
  explicitUserProvided = false,
  explicitUser = null,
  user = null,
  session = null,
} = {}) {
  if (!explicitUserProvided) return true;
  if (!explicitUser || !user) return false;

  if (sameUser(explicitUser, user)) return true;
  if (session && sameSessionUser(session, explicitUser)) return true;

  return false;
}

/* =========================================================
   STATE PATCH
========================================================= */

function buildStatePatch({
  token = "",
  refreshToken = "",
  user = null,
  session = null,
} = {}) {
  const safeToken = cleanToken(token);
  const safeRefreshToken = cleanToken(refreshToken);
  const safeUser = normalizeUser(user);
  const rawSession = sanitizeSessionContext(session);

  const safeSession = safeUser && rawSession && sameSessionUser(rawSession, safeUser)
    ? rawSession
    : null;

  const hasToken = Boolean(safeToken);
  const hasRefreshToken = Boolean(safeRefreshToken);
  const authenticated = Boolean(hasToken && safeUser);

  const role = authenticated
    ? cleanRole(safeUser.role || safeUser.rol || safeUser.roles)
    : null;

  const slug = authenticated ? extractSessionUserSlug(safeUser) : "";

  const homePath = authenticated
    ? buildSessionUserHomePath(safeUser)
    : AUTH_HOME.canonical;

  const avatar = authenticated ? resolveUserAvatar(safeUser) : "";
  const hasAvatar = authenticated ? resolveUserHasAvatar(safeUser) : false;

  const sessionData = authenticated && safeSession
    ? {
        ...safeSession,

        sessionId: safeSession.sessionId || safeSession.id || null,
        id: safeSession.sessionId || safeSession.id || null,

        userId: safeSession.userId || safeSession.sessionUserId || safeUser.userId || safeUser.id || null,
        sessionUserId: safeSession.sessionUserId || safeSession.userId || safeUser.userId || safeUser.id || null,

        role,
        roles: [role],
        userSlug: slug || null,
        homePath,
        authenticated: true,
      }
    : null;

  return {
    token: hasToken ? safeToken : null,
    accessToken: hasToken ? safeToken : null,
    access_token: hasToken ? safeToken : null,

    /*
      El refresh token no se mantiene como estado canónico.
      Sólo se lee/persiste vía storage.js para restore controlado.
    */
    hasRefreshToken,

    user: authenticated ? safeUser : null,
    currentUser: authenticated ? safeUser : null,
    authUser: authenticated ? safeUser : null,
    sessionUser: authenticated ? safeUser : null,

    authenticated,
    hasToken,

    role,
    rol: role,
    userRole: role,
    roles: authenticated ? [role] : [],

    isAdmin: role === "admin",
    isUser: role === "user",

    userSlug: authenticated ? slug || null : null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : null,

    session: sessionData,
    sessionData,
    sessionId: authenticated ? sessionData?.sessionId || null : null,
    sessionUserId: authenticated ? sessionData?.sessionUserId || null : null,

    username: authenticated ? safeUser.username || null : null,

    hasAvatar: authenticated ? Boolean(hasAvatar || avatar) : false,
    avatar: authenticated ? avatar || null : null,
    avatarUrl: authenticated ? avatar || null : null,
    photoUrl: authenticated ? safeUser.photoUrl || avatar || null : null,
    picture: authenticated ? safeUser.picture || avatar || null : null,
    avatarUpdatedAt: authenticated ? safeUser.avatarUpdatedAt || null : null,

    lastAuthSyncAt: nowIso(),
  };
}

function persistPatch({
  token = "",
  refreshToken = "",
  session = null,
  clearMissingRefreshToken = false,
  clearMissingSessionContext = false,
} = {}) {
  const safeToken = cleanToken(token);
  const safeRefreshToken = cleanToken(refreshToken);
  const safeSession = sanitizeSessionContext(session);

  if (!safeToken) return false;

  try {
    persistAuthStorage(
      {
        token: safeToken,
        accessToken: safeToken,
        access_token: safeToken,

        ...(safeRefreshToken
          ? {
              refreshToken: safeRefreshToken,
              refresh_token: safeRefreshToken,
            }
          : {}),

        /*
          No persistimos user completo como fuente de autenticación.
          El usuario canónico se resuelve en restore vía /api/auth/me.
        */

        ...(safeSession
          ? {
              session: safeSession,
              sessionData: safeSession,
            }
          : {}),
      },
      {
        source: SOURCE,
        clearMissingRefreshToken,
        clearMissingSessionContext,
      }
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SNAPSHOT
========================================================= */

function currentSnapshot(extra = {}) {
  const token = bestStateToken();
  const refreshToken = bestStateRefreshToken();
  const user = bestStateUser();
  const session = bestStateSession(user);

  const hasToken = Boolean(token);
  const hasRefreshToken = Boolean(refreshToken);
  const authenticated = Boolean(hasToken && user);

  const role = authenticated
    ? cleanRole(user.role || user.rol || user.roles)
    : null;

  const slug = authenticated ? extractSessionUserSlug(user) : "";

  const homePath = authenticated
    ? buildSessionUserHomePath(user)
    : AUTH_HOME.canonical;

  return {
    version: AUTH_SESSION_VERSION,

    authenticated,
    hasToken,
    hasRefreshToken,

    user: authenticated ? user : null,

    userSlug: slug || null,
    homePath,
    defaultHome: homePath,
    postLoginTarget: authenticated ? homePath : null,

    role,
    roles: authenticated ? [role] : [],

    isAdmin: role === "admin",
    isUser: role === "user",

    session: authenticated ? session : null,
    sessionId: authenticated ? session?.sessionId || session?.id || null : null,
    sessionUserId: authenticated ? session?.sessionUserId || session?.userId || null : null,

    ...extra,
  };
}

function publicUser(user = null) {
  const normalized = normalizeUser(user);

  if (!normalized) return null;

  const avatar = resolveUserAvatar(normalized);

  return {
    id: normalized.id || normalized.userId || null,
    userId: normalized.userId || normalized.id || null,
    username: normalized.username || null,
    slug: extractSessionUserSlug(normalized) || null,
    displayName: normalized.displayName || normalized.name || normalized.username || null,
    role: normalized.role || normalized.rol || null,

    hasAvatar: Boolean(normalized.hasAvatar || avatar),
    avatar: avatar || null,
    avatarUrl: avatar || null,
    picture: normalized.picture || avatar || null,
    photoUrl: normalized.photoUrl || avatar || null,
    avatarUpdatedAt: normalized.avatarUpdatedAt || null,
  };
}

function publicSnapshot(snapshot = {}) {
  return {
    version: AUTH_SESSION_VERSION,

    authenticated: Boolean(snapshot.authenticated),
    hasToken: Boolean(snapshot.hasToken),
    hasRefreshToken: Boolean(snapshot.hasRefreshToken),

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,

    user: publicUser(snapshot.user),

    userSlug: snapshot.userSlug || null,
    homePath: snapshot.homePath || AUTH_HOME.canonical,
    defaultHome: snapshot.defaultHome || snapshot.homePath || AUTH_HOME.canonical,
    postLoginTarget: snapshot.postLoginTarget || null,

    role: snapshot.role || null,
    roles: Array.isArray(snapshot.roles) ? snapshot.roles : [],

    isAdmin: Boolean(snapshot.isAdmin),
    isUser: Boolean(snapshot.isUser),

    sessionId: snapshot.sessionId ? "***" : null,
    sessionUserId: snapshot.sessionUserId ? "***" : null,

    source: snapshot.source || "",
    eventMode: snapshot.eventMode || "",
    at: snapshot.at || nowIso(),

    policy: {
      sessionOnly: true,
      strictAuth: true,

      tokenWithoutUserIsNotAuthenticated: true,
      userWithoutTokenIsNotAuthenticated: true,

      invalidStatuses: ["suspended", "desactivado"],

      doesNotFabricateUserFromStorage: true,
      doesNotPersistUserAsAuthSource: true,

      accessTokenPersistedForReload: true,
      refreshTokenNeverInCoreState: true,
      refreshTokenReadForRestoreOnly: true,
      supportsHttpOnlyCookieRefresh: true,
      noRefreshTokenInSnapshot: true,

      preservesUserVisualFields: true,
      noSlugFabrication: true,

      noRouter: true,
      noToast: true,
      noFetch: true,
      noOtp: true,
      noMfa: true,
      no2fa: true,

      snapshotRedacted: true,
    },
  };
}

/* =========================================================
   SESSION API
========================================================= */

export function applySession(payload = {}, options = {}) {
  const source = options.source || SOURCE;
  const eventMode = options.eventMode || "apply";

  const explicitToken = readTokenFromPayload(payload);
  const explicitRefreshToken = readRefreshTokenFromPayload(payload);

  const explicitUserProvided = payloadHasExplicitUser(payload);
  const explicitUser = readUserFromPayload(payload);

  if (explicitUserProvided && !explicitUser) {
    clearSessionLocal({
      source: `${source}:invalid-user`,
      keepStorage: false,
    });

    return buildSessionSnapshot({
      source,
      eventMode: "invalid-user",
    });
  }

  const token =
    explicitToken ||
    (options.useCurrentToken === false ? "" : bestStateToken());

  const currentUser = bestStateUser();

  const user =
    explicitUser ||
    (options.useCurrentUser === false ? null : currentUser);

  const currentSession = options.keepCurrentSession === false
    ? null
    : bestStateSession(user || currentUser);

  const explicitSession = readSessionFromPayload(payload, user);

  const canKeepCurrentRefreshContext = shouldKeepCurrentRefreshContext({
    explicitUserProvided,
    explicitUser,
    user: user || currentUser,
    session: explicitSession || currentSession,
  });

  const refreshToken =
    explicitRefreshToken ||
    (
      options.useCurrentRefreshToken === false || !canKeepCurrentRefreshContext
        ? ""
        : bestStateRefreshToken()
    );

  const session =
    explicitSession ||
    (
      canKeepCurrentRefreshContext
        ? currentSession
        : null
    );

  const patch = buildStatePatch({
    token,
    refreshToken,
    user,
    session,
  });

  commitState(patch, {
    source,
    silent: true,
    emit: false,

    /*
      Importante:
      token sin user debe conservar hasToken=true y authenticated=false.
      Sólo forzamos limpieza total si no hay token.
    */
    forceUnauthenticated: !patch.hasToken,
  });

  /*
    Persistimos token/refresh/contexto auxiliar.
    No persistimos user completo como fuente de autenticación.
  */
  if (patch.hasToken) {
    persistPatch({
      token,
      refreshToken,
      session: patch.session,
      clearMissingRefreshToken: !canKeepCurrentRefreshContext,
      clearMissingSessionContext: !canKeepCurrentRefreshContext,
    });
  }

  return buildSessionSnapshot({
    source,
    eventMode,
  });
}

export function clearSessionLocal(options = {}) {
  commitState(
    {
      token: null,
      accessToken: null,
      access_token: null,

      hasRefreshToken: false,

      user: null,
      currentUser: null,
      authUser: null,
      sessionUser: null,

      authenticated: false,
      hasToken: false,

      role: null,
      rol: null,
      userRole: null,
      roles: [],

      isAdmin: false,
      isUser: false,

      userSlug: null,
      homePath: AUTH_HOME.canonical,
      defaultHome: AUTH_HOME.canonical,
      postLoginTarget: null,

      session: null,
      sessionData: null,
      sessionId: null,
      sessionUserId: null,

      username: null,
      hasAvatar: false,
      avatar: null,
      avatarUrl: null,
      photoUrl: null,
      picture: null,
      avatarUpdatedAt: null,

      lastAuthSyncAt: nowIso(),
    },
    {
      source: options.source || `${SOURCE}:clear`,
      silent: true,
      emit: false,
      forceUnauthenticated: true,
    }
  );

  if (options.keepStorage !== true) {
    try {
      clearAuthStorage();
    } catch {
      // noop
    }
  }

  return true;
}

export const clearSession = clearSessionLocal;

export function syncAuthState(options = {}) {
  const user = bestStateUser();

  const patch = buildStatePatch({
    token: bestStateToken(),
    refreshToken: bestStateRefreshToken(),
    user,
    session: bestStateSession(user),
  });

  commitState(patch, {
    source: options.source || `${SOURCE}:sync`,
    silent: true,
    emit: false,
    forceUnauthenticated: !patch.hasToken,
  });

  return buildSessionSnapshot({
    source: options.source || SOURCE,
    eventMode: "sync",
  });
}

export function buildSessionSnapshot(extra = {}) {
  return publicSnapshot(
    currentSnapshot({
      ...extra,
      at: nowIso(),
    })
  );
}

/* =========================================================
   AUTH HELPERS
========================================================= */

export function isAuthenticated() {
  return Boolean(bestStateToken() && bestStateUser());
}

export function hasToken() {
  return Boolean(bestStateToken());
}

export function hasRefreshToken() {
  return Boolean(bestStateRefreshToken());
}

export function getCurrentUser() {
  return isAuthenticated() ? bestStateUser() : null;
}

export function getCurrentToken() {
  return bestStateToken();
}

export function getCurrentRefreshToken() {
  return bestStateRefreshToken();
}

export function getCurrentSession() {
  return getCurrentSessionContext();
}

export function getCurrentSessionContext() {
  const user = bestStateUser();
  return bestStateSession(user);
}

export function getCurrentRole() {
  const user = getCurrentUser();

  return user
    ? cleanRole(readState().role || user.role || user.rol || user.roles)
    : "";
}

export function getCurrentRoles() {
  const role = getCurrentRole();

  return role ? [role] : [];
}

export function isCurrentUserAdmin() {
  return getCurrentRole() === "admin";
}

export function hasRole(...roles) {
  if (!isAuthenticated()) return false;
  if (!roles.length) return true;

  const current = getCurrentRole();

  if (current === "admin") return true;

  return roles
    .flat()
    .map(normalizeRole)
    .filter(Boolean)
    .some((role) => role === current);
}

export function requireRole(...roles) {
  if (hasRole(...roles)) return true;

  const error = new Error("No tienes permisos para acceder a este recurso.");
  error.code = "AUTH_FORBIDDEN";
  error.status = 403;

  throw error;
}

export function getAuthHeader() {
  const token = getCurrentToken();

  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

/* =========================================================
   ERROR / SNAPSHOT
========================================================= */

export function getSessionDebugSnapshot() {
  return buildSessionSnapshot({
    eventMode: "debug",
  });
}

export function buildAuthErrorPayload(error = null) {
  return {
    error: error
      ? {
          name: cleanText(error.name, "Error"),
          status: error.status || error.response?.status || error.data?.status || null,
          code: error.code || error.data?.code || error.response?.data?.code || null,
        }
      : null,

    message: redact(
      cleanText(error?.data?.message, "") ||
        cleanText(error?.response?.data?.message, "") ||
        cleanText(error?.message, "") ||
        String(error || "")
    ),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  AUTH_SESSION_VERSION,

  applySession,
  clearSessionLocal,
  clearSession,
  syncAuthState,

  buildSessionSnapshot,

  isAuthenticated,
  hasToken,
  hasRefreshToken,

  getCurrentUser,
  getCurrentToken,
  getCurrentRefreshToken,
  getCurrentSession,
  getCurrentSessionContext,

  getCurrentRole,
  getCurrentRoles,

  getCurrentUserSlug,
  getCurrentUserHomePath,

  isCurrentUserAdmin,

  hasRole,
  requireRole,

  getAuthHeader,

  normalizeSessionSlug,
  extractSessionUserSlug,
  buildSessionUserHomePath,

  normalizeUser,
  normalizeSessionContext,

  getSessionDebugSnapshot,
  buildAuthErrorPayload,
};

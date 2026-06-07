/* =========================================================
   Onion SPA - Cuenta API
   Archivo: src/views/cuenta/cuenta.api.js

   API real de la vista Cuenta.
   - Sin state/store local.
   - Sin storage.
   - Sin fetch propio.
   - Sin token manual.
   - Sin bridges globales.
   - Sólo delega en Core HTTP.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

export const CUENTA_API_VERSION = "cuenta.api.stable.v1";

export const CUENTA_RESOURCE = "cuenta";

export const CUENTA_ENDPOINTS = Object.freeze({
  me: "/api/auth/me",
  changePassword: "/api/auth/change-password",

  users: "/api/users",
  usersMeta: "/api/users/_meta",
  usersSessions: "/api/users/sessions",
  usersAvatar: "/api/users/avatar",
});

export const CUENTA_ENDPOINT = CUENTA_ENDPOINTS.me;
export const CUENTA_ALT_ENDPOINT = CUENTA_ENDPOINTS.users;

export const CUENTA_TIMEOUT = 30000;
export const CUENTA_DETAIL_TIMEOUT = 30000;
export const CUENTA_UPLOAD_TIMEOUT = 60000;

const DEFAULT_LANG = "es";
const DEFAULT_THEME = "light";
const DEFAULT_ROLE = "user";
const DEFAULT_STATUS = "active";

let lastLoadToken = 0;

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function safeObject(value, fallback = {}) {
  return isPlainObject(value) ? value : fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
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

function hasOwn(object = {}, key = "") {
  return Object.prototype.hasOwnProperty.call(Object(object), key);
}

function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeBoolean(value = undefined, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const key = normalizeKey(value);

  if (
    [
      "true",
      "1",
      "yes",
      "y",
      "si",
      "sí",
      "on",
      "enabled",
      "active",
      "activo",
      "activa",
      "dark",
      "oscuro",
    ].includes(key)
  ) {
    return true;
  }

  if (
    [
      "false",
      "0",
      "no",
      "n",
      "off",
      "disabled",
      "inactive",
      "inactivo",
      "inactiva",
      "light",
      "claro",
    ].includes(key)
  ) {
    return false;
  }

  return Boolean(fallback);
}

function normalizeLang(value = DEFAULT_LANG) {
  const key = normalizeKey(value);

  if (["en", "eng", "english", "en_us", "en_gb"].includes(key)) return "en";
  if (["ca", "cat", "catala", "catalan", "ca_es", "catalunya"].includes(key)) return "ca";

  return "es";
}

function normalizeTheme(value = "", fallbackDarkMode = false) {
  const key = normalizeKey(value);

  if (["dark", "oscuro", "night", "theme_dark"].includes(key)) return "dark";
  if (["light", "claro", "day", "theme_light"].includes(key)) return "light";

  return fallbackDarkMode ? "dark" : "light";
}

function normalizeRole(value = DEFAULT_ROLE) {
  const role = normalizeKey(value);

  if (role === "admin") return "admin";

  return "user";
}

function normalizeStatus(value = DEFAULT_STATUS) {
  const status = normalizeKey(value);

  if (["disabled", "inactive", "inactivo", "desactivado", "blocked", "bloqueado"].includes(status)) {
    return "disabled";
  }

  if (["deleted", "eliminado", "removed"].includes(status)) return "deleted";
  if (["archived", "archivado"].includes(status)) return "archived";
  if (["suspended", "suspendido"].includes(status)) return "suspended";
  if (["pending", "pendiente"].includes(status)) return "pending";

  return "active";
}

function encodePathSegment(value = "") {
  return encodeURIComponent(safeText(value, ""));
}

function cleanPayload(payload = {}) {
  const source = safeObject(payload);
  const output = {};

  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined) return;
    output[key] = value;
  });

  return output;
}

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

/* =========================================================
   CORE / HTTP
========================================================= */

function getHttpClient() {
  const client =
    AppCore?.getHttpClient?.() ||
    AppCore?.getActiveApiClient?.() ||
    AppCore?.Http ||
    AppCore?.http ||
    Http;

  if (!client) {
    throw new Error("CUENTA_HTTP_UNAVAILABLE");
  }

  return client;
}

async function requestJson(method = "GET", endpoint = "", { body, query, timeout = CUENTA_TIMEOUT } = {}) {
  const client = getHttpClient();
  const verb = safeText(method, "GET").toUpperCase();

  const options = {
    timeout,
    query,
    auth: true,
  };

  if (verb === "GET" && isFunction(client.get)) {
    return client.get(endpoint, options);
  }

  if (verb === "POST" && isFunction(client.post)) {
    return client.post(endpoint, body, options);
  }

  if (verb === "PUT" && isFunction(client.put)) {
    return client.put(endpoint, body, options);
  }

  if (verb === "PATCH" && isFunction(client.patch)) {
    return client.patch(endpoint, body, options);
  }

  if (verb === "DELETE") {
    const deleteFn = client.del || client.delete;

    if (isFunction(deleteFn)) {
      return deleteFn.call(client, endpoint, options);
    }
  }

  if (isFunction(client.request)) {
    return client.request(endpoint, {
      ...options,
      method: verb,
      body,
    });
  }

  throw new Error("CUENTA_HTTP_METHOD_UNAVAILABLE");
}

function getCoreState() {
  try {
    return safeObject(AppCore?.getState?.(), {});
  } catch {
    return safeObject(AppCore?.state, {});
  }
}

function getCurrentCoreUser() {
  return safeObject(
    first(
      AppCore?.getCurrentUser?.(),
      getCoreState().user,
      getCoreState().currentUser,
      null
    ),
    null
  );
}

function applyCuentaToCore(item = null) {
  const detail = normalizeCuentaDetail(item);

  if (!detail) return null;

  try {
    AppCore?.setUser?.({
      id: detail.id,
      userId: detail.userId,
      uid: detail.userId,

      username: detail.username,
      usernameLower: detail.usernameLower,
      slug: detail.slug,

      name: detail.name,
      displayName: detail.displayName,
      fullName: detail.fullName,

      avatar: detail.avatar,
      avatarUrl: detail.avatarUrl,
      picture: detail.picture,

      role: detail.role,
      rol: detail.role,
      roles: [detail.role],

      status: detail.status,
      active: detail.active,
      usable: detail.usable,
    });
  } catch {}

  return detail;
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function getErrorStatus(error = null) {
  return Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      error?.payload?.status ||
      error?.data?.status ||
      0
  ) || 0;
}

function getErrorCode(error = null) {
  return safeText(
    first(
      error?.code,
      error?.error,
      error?.payload?.code,
      error?.payload?.error,
      error?.data?.code,
      error?.data?.error,
      error?.response?.code,
      error?.response?.error,
      ""
    ),
    ""
  );
}

function normalizeErrorMessage(error = null, fallback = "Error de cuenta.") {
  return safeText(
    first(
      error?.message,
      error?.payload?.message,
      error?.payload?.detail,
      error?.data?.message,
      error?.data?.detail,
      error?.response?.message,
      error?.response?.detail,
      error?.error,
      error?.code,
      fallback
    ),
    fallback
  );
}

function createCuentaError(error = null, fallback = "Error de cuenta.") {
  const normalized = new Error(normalizeErrorMessage(error, fallback));

  normalized.name = "CuentaApiError";
  normalized.code = getErrorCode(error) || "CUENTA_API_ERROR";
  normalized.status = getErrorStatus(error);
  normalized.statusCode = normalized.status;
  normalized.cause = error || null;

  return normalized;
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function hasProfileEvidence(value = {}) {
  const obj = safeObject(value);

  return Boolean(
    obj.userId ||
      obj.uid ||
      obj.sub ||
      obj.id ||
      obj.email ||
      obj.emailLower ||
      obj.mail ||
      obj.username ||
      obj.usernameLower ||
      obj.userName ||
      obj.slug ||
      obj.name ||
      obj.nombre ||
      obj.fullName ||
      obj.displayName ||
      obj.avatar ||
      obj.avatarUrl ||
      obj.photoURL ||
      obj.photoUrl ||
      obj.picture ||
      obj.pictureUrl ||
      obj.profile ||
      obj.user ||
      obj.usuario ||
      obj.account ||
      obj.me
  );
}

function hasPreferenceEvidence(value = {}) {
  const obj = safeObject(value);

  return Boolean(
    hasOwn(obj, "darkMode") ||
      hasOwn(obj, "privacyMode") ||
      hasOwn(obj, "theme") ||
      hasOwn(obj, "mode") ||
      hasOwn(obj, "appearance") ||
      hasOwn(obj, "lang") ||
      hasOwn(obj, "language") ||
      hasOwn(obj, "locale") ||
      obj.preferences ||
      obj.settings
  );
}

function hasCuentaEvidence(value = {}) {
  return hasProfileEvidence(value) || hasPreferenceEvidence(value);
}

function unwrapEnvelope(payload = null) {
  if (payload === null || payload === undefined) return null;
  if (Array.isArray(payload)) return payload[0] || null;

  const root = safeObject(payload);

  if (!Object.keys(root).length) return payload;

  const data = safeObject(root.data);
  const auth = safeObject(root.auth);
  const payloadObj = safeObject(root.payload);
  const result = safeObject(root.result);

  return first(
    root.user,
    root.usuario,
    root.me,
    root.account,
    root.profile,
    root.item,
    root.cuenta,

    data.user,
    data.usuario,
    data.me,
    data.account,
    data.profile,
    data.item,
    data.cuenta,

    auth.user,
    auth.usuario,
    auth.me,
    auth.account,
    auth.profile,

    payloadObj.user,
    payloadObj.usuario,
    payloadObj.me,
    payloadObj.account,
    payloadObj.profile,
    payloadObj.item,
    payloadObj.cuenta,

    result.user,
    result.usuario,
    result.me,
    result.account,
    result.profile,
    result.item,
    result.cuenta,

    root
  );
}

function collectCuentaSource(payload = null, fallback = {}) {
  const base = safeObject(fallback);
  const root = safeObject(payload);
  const unwrapped = safeObject(unwrapEnvelope(payload));

  const data = safeObject(root.data);
  const auth = safeObject(root.auth);

  const user = safeObject(
    first(
      root.user,
      root.usuario,
      root.me,
      data.user,
      data.usuario,
      data.me,
      auth.user,
      auth.usuario,
      auth.me,
      unwrapped.user,
      unwrapped.usuario,
      unwrapped.me,
      {}
    )
  );

  const account = safeObject(
    first(
      root.account,
      data.account,
      auth.account,
      unwrapped.account,
      {}
    )
  );

  const profile = safeObject(
    first(
      root.profile,
      data.profile,
      auth.profile,
      unwrapped.profile,
      user.profile,
      account.profile,
      {}
    )
  );

  const preferences = safeObject(
    first(
      root.preferences,
      data.preferences,
      auth.preferences,
      unwrapped.preferences,
      user.preferences,
      account.preferences,
      profile.preferences,
      root.settings,
      data.settings,
      unwrapped.settings,
      base.preferences,
      base.settings,
      {}
    )
  );

  return {
    ...base,
    ...unwrapped,
    ...account,
    ...user,
    ...profile,
    ...preferences,

    user,
    usuario: user,
    account,
    profile,

    preferences: {
      ...safeObject(base.preferences),
      ...preferences,
    },

    settings: {
      ...safeObject(base.settings),
      ...safeObject(unwrapped.settings),
      ...preferences,
    },
  };
}

export function normalizeCuentaDetail(detail = {}, fallback = {}) {
  const fallbackObj = safeObject(fallback);
  const source = collectCuentaSource(detail, fallbackObj);

  if (!hasCuentaEvidence(source) && !hasCuentaEvidence(fallbackObj)) {
    return null;
  }

  const rawTheme = first(
    source.theme,
    source.mode,
    source.appearance,
    source.colorMode,
    source.preferences?.theme,
    source.preferences?.mode,
    source.preferences?.appearance,
    source.settings?.theme,
    source.settings?.mode,
    source.settings?.appearance,
    fallbackObj.theme,
    fallbackObj.preferences?.theme,
    DEFAULT_THEME
  );

  const darkMode = normalizeBoolean(
    first(
      source.darkMode,
      source.isDark,
      source.preferences?.darkMode,
      source.settings?.darkMode,
      rawTheme === "dark" ? true : null,
      rawTheme === "light" ? false : null,
      fallbackObj.darkMode,
      fallbackObj.preferences?.darkMode,
      DEFAULT_THEME === "dark"
    ),
    false
  );

  const theme = normalizeTheme(rawTheme, darkMode);

  const privacyMode = normalizeBoolean(
    first(
      source.privacyMode,
      source.privateMode,
      source.isPrivate,
      source.preferences?.privacyMode,
      source.settings?.privacyMode,
      fallbackObj.privacyMode,
      fallbackObj.preferences?.privacyMode,
      false
    ),
    false
  );

  const lang = normalizeLang(
    first(
      source.lang,
      source.language,
      source.locale,
      source.idioma,
      source.preferences?.lang,
      source.preferences?.language,
      source.settings?.lang,
      fallbackObj.lang,
      fallbackObj.preferences?.lang,
      DEFAULT_LANG
    )
  );

  const userId = safeText(
    first(
      source.userId,
      source.uid,
      source.sub,
      source.user_id,
      source.account?.userId,
      source.user?.userId,
      fallbackObj.userId,
      fallbackObj.id,
      ""
    ),
    ""
  );

  const id = safeText(
    first(
      source.id,
      source._id,
      userId,
      fallbackObj.id,
      fallbackObj._id,
      CUENTA_RESOURCE
    ),
    CUENTA_RESOURCE
  );

  const email = safeLower(
    first(
      source.email,
      source.emailLower,
      source.mail,
      source.userEmail,
      source.profile?.email,
      source.user?.email,
      source.account?.email,
      fallbackObj.email,
      fallbackObj.emailLower,
      ""
    ),
    ""
  );

  const username = safeText(
    first(
      source.username,
      source.usernameLower,
      source.userName,
      source.user_name,
      source.handle,
      source.slug,
      source.profile?.username,
      source.user?.username,
      source.account?.username,
      fallbackObj.username,
      fallbackObj.usernameLower,
      ""
    ),
    ""
  );

  const slug = safeLower(
    first(
      source.slug,
      source.lookup?.slug,
      source.routing?.slug,
      username,
      fallbackObj.slug,
      ""
    ),
    ""
  ).replace(/^@+/, "");

  const name = safeText(
    first(
      source.name,
      source.nombre,
      source.fullName,
      source.displayName,
      source.profile?.name,
      source.profile?.nombre,
      source.profile?.fullName,
      source.profile?.displayName,
      source.user?.name,
      source.user?.nombre,
      source.user?.fullName,
      source.user?.displayName,
      source.account?.name,
      source.account?.displayName,
      fallbackObj.name,
      fallbackObj.displayName,
      username,
      email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );

  const phone = safeText(
    first(
      source.phone,
      source.telefono,
      source.mobile,
      source.tel,
      source.profile?.phone,
      source.profile?.telefono,
      source.user?.phone,
      source.user?.telefono,
      source.account?.phone,
      fallbackObj.phone,
      fallbackObj.telefono,
      ""
    ),
    ""
  );

  const avatarUrl = safeText(
    first(
      source.avatarUrl,
      source.avatarURL,
      source.avatar_url,
      source.avatar,
      source.photoUrl,
      source.photoURL,
      source.photo_url,
      source.photo,
      source.imageUrl,
      source.image,
      source.picture,
      source.pictureUrl,
      source.profilePicture,
      source.profilePictureUrl,

      source.profile?.avatarUrl,
      source.profile?.avatar,
      source.profile?.photoUrl,
      source.profile?.photoURL,
      source.profile?.imageUrl,
      source.profile?.picture,

      source.user?.avatarUrl,
      source.user?.avatar,
      source.user?.photoUrl,
      source.user?.photoURL,
      source.user?.imageUrl,
      source.user?.picture,

      source.account?.avatarUrl,
      source.account?.avatar,
      source.account?.photoUrl,
      source.account?.imageUrl,

      fallbackObj.avatarUrl,
      fallbackObj.avatar,
      fallbackObj.photoUrl,
      fallbackObj.picture,
      ""
    ),
    ""
  );

  const role = normalizeRole(
    first(
      source.role,
      source.rol,
      safeArray(source.roles)[0],
      source.user?.role,
      source.user?.rol,
      source.account?.role,
      fallbackObj.role,
      DEFAULT_ROLE
    )
  );

  const status = normalizeStatus(
    first(
      source.status,
      source.estado,
      source.accountStatus,
      source.profileStatus,
      source.user?.status,
      source.account?.status,
      fallbackObj.status,
      DEFAULT_STATUS
    )
  );

  const invalidStatus = ["disabled", "deleted", "archived", "suspended"].includes(status);

  const active = normalizeBoolean(
    first(
      source.active,
      source.enabled,
      invalidStatus ? false : null,
      fallbackObj.active,
      true
    ),
    true
  );

  const usable =
    source.usable !== false &&
    source.disabled !== true &&
    source.deleted !== true &&
    source.archived !== true &&
    source.blocked !== true &&
    active === true &&
    !invalidStatus;

  const clienteId = safeText(
    first(
      source.clienteId,
      source.clientId,
      source.customerId,
      source.cliente?.clienteId,
      source.cliente?.id,
      source.user?.clienteId,
      source.account?.clienteId,
      fallbackObj.clienteId,
      ""
    ),
    ""
  );

  const createdAt = first(
    source.createdAt,
    source.created_at,
    source.created,
    source.registeredAt,
    source.user?.createdAt,
    source.account?.createdAt,
    fallbackObj.createdAt,
    null
  );

  const updatedAt = first(
    source.updatedAt,
    source.updated_at,
    source.modifiedAt,
    source.lastUpdatedAt,
    source.preferences?.updatedAt,
    source.settings?.updatedAt,
    source.user?.updatedAt,
    source.account?.updatedAt,
    fallbackObj.updatedAt,
    null
  );

  const lastLoginAt = first(
    source.lastLoginAt,
    source.lastLogin,
    source.lastSeenAt,
    source.lastAccessAt,
    source.session?.lastLoginAt,
    fallbackObj.lastLoginAt,
    null
  );

  const preferences = {
    ...safeObject(fallbackObj.preferences),
    ...safeObject(source.preferences),

    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,

    lang,
    language: lang,
    locale: lang,

    updatedAt,
  };

  const profile = {
    ...safeObject(fallbackObj.profile),
    ...safeObject(source.profile),

    name,
    nombre: safeText(first(source.profile?.nombre, name), name),
    fullName: safeText(first(source.profile?.fullName, name), name),
    displayName: safeText(first(source.profile?.displayName, name), name),

    email,
    username,

    phone,
    telefono: phone,

    avatar: avatarUrl,
    avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,
  };

  return {
    id,
    _id: id,

    userId,
    uid: userId,
    sub: userId,

    email,
    emailLower: email,

    username,
    usernameLower: safeLower(username),
    slug,

    name,
    nombre: name,
    fullName: name,
    displayName: name,

    phone,
    telefono: phone,
    mobile: phone,

    avatar: avatarUrl,
    avatarUrl,
    avatarURL: avatarUrl,
    avatar_url: avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    photo_url: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,
    image: avatarUrl,
    imageUrl: avatarUrl,
    profilePicture: avatarUrl,
    profilePictureUrl: avatarUrl,

    role,
    rol: role,
    roles: [role],

    status,
    estado: status,
    active,
    usable,

    clienteId,
    clientId: clienteId,
    customerId: clienteId,

    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,
    colorMode: theme,

    lang,
    language: lang,
    locale: lang,
    idioma: lang,

    createdAt,
    created_at: createdAt,
    updatedAt,
    updated_at: updatedAt,
    lastLoginAt,

    preferences,
    settings: {
      ...safeObject(source.settings),
      ...preferences,
    },
    profile,

    user: {
      id,
      userId,
      email,
      username,
      slug,
      name,
      displayName: name,
      phone,
      avatar: avatarUrl,
      avatarUrl,
      role,
      rol: role,
      roles: [role],
      status,
      active,
      usable,
      ...preferences,
    },

    usuario: {
      id,
      userId,
      email,
      username,
      slug,
      name,
      displayName: name,
      phone,
      avatar: avatarUrl,
      avatarUrl,
      role,
      rol: role,
      roles: [role],
      status,
      active,
      usable,
      ...preferences,
    },

    account: {
      id,
      userId,
      email,
      username,
      slug,
      name,
      displayName: name,
      phone,
      avatar: avatarUrl,
      avatarUrl,
      role,
      status,
      active,
      usable,
      clienteId,
      ...preferences,
    },
  };
}

function normalizeCuentaResponse(response = null, fallback = {}) {
  return normalizeCuentaDetail(response, fallback);
}

function getCurrentCuentaFallback() {
  return normalizeCuentaDetail(getCurrentCoreUser(), {}) || {};
}

/* =========================================================
   ENDPOINT HELPERS
========================================================= */

export function getCuentaEndpoint() {
  return CUENTA_ENDPOINTS.me;
}

export function getCuentaAltEndpoint() {
  return CUENTA_ENDPOINTS.users;
}

export function getCuentaByIdEndpoint(id = "") {
  const cleanId = safeText(id, "");

  if (!cleanId) return CUENTA_ENDPOINTS.me;

  return `${CUENTA_ENDPOINTS.users}/${encodePathSegment(cleanId)}`;
}

export function getCuentaUpdateEndpoint(id = "") {
  return getCuentaByIdEndpoint(id);
}

export function getCuentaThemeEndpoint(id = "") {
  return getCuentaUpdateEndpoint(id);
}

export function getCuentaThemeToggleEndpoint(id = "") {
  return getCuentaUpdateEndpoint(id);
}

export function getCuentaPrivacyEndpoint(id = "") {
  return getCuentaUpdateEndpoint(id);
}

export function getCuentaPrivacyToggleEndpoint(id = "") {
  return getCuentaUpdateEndpoint(id);
}

export function getCuentaLanguageEndpoint(id = "") {
  return getCuentaUpdateEndpoint(id);
}

export function getCuentaLangEndpoint(id = "") {
  return getCuentaUpdateEndpoint(id);
}

export function getCuentaMetaEndpoint() {
  return CUENTA_ENDPOINTS.usersMeta;
}

export function getCuentaAvatarEndpoint() {
  return CUENTA_ENDPOINTS.usersAvatar;
}

export function getCuentaSessionsEndpoint() {
  return CUENTA_ENDPOINTS.usersSessions;
}

export function getCuentaChangePasswordEndpoint() {
  return CUENTA_ENDPOINTS.changePassword;
}

/* =========================================================
   PAYLOAD BUILDERS
========================================================= */

function resolveCuentaId(input = {}) {
  const source = safeObject(input);
  const current = getCurrentCuentaFallback();

  return safeText(
    first(
      source.userId,
      source.uid,
      source.id,
      current.userId,
      current.id,
      ""
    ),
    ""
  );
}

function normalizeCuentaUpdatePayload(payload = {}) {
  const body = safeObject(payload);
  const output = {};
  const preferences = {};

  const hasName =
    hasOwn(body, "name") ||
    hasOwn(body, "nombre") ||
    hasOwn(body, "displayName") ||
    hasOwn(body, "fullName");

  const hasPhone =
    hasOwn(body, "phone") ||
    hasOwn(body, "telefono") ||
    hasOwn(body, "mobile");

  const hasDarkMode =
    hasOwn(body, "darkMode") ||
    hasOwn(body, "isDark") ||
    hasOwn(body, "theme") ||
    hasOwn(body, "mode") ||
    hasOwn(body, "appearance");

  const hasPrivacyMode =
    hasOwn(body, "privacyMode") ||
    hasOwn(body, "privateMode") ||
    hasOwn(body, "privacy");

  const hasLang =
    hasOwn(body, "lang") ||
    hasOwn(body, "language") ||
    hasOwn(body, "locale") ||
    hasOwn(body, "idioma");

  if (hasName) {
    const name = safeText(
      first(body.name, body.nombre, body.displayName, body.fullName),
      ""
    );

    output.name = name;
    output.nombre = name;
    output.displayName = name;
    output.fullName = name;
  }

  if (hasPhone) {
    const phone = safeText(first(body.phone, body.telefono, body.mobile), "");

    output.phone = phone;
    output.telefono = phone;
    output.mobile = phone;
  }

  if (hasDarkMode) {
    const rawTheme = first(
      body.theme,
      body.mode,
      body.appearance,
      body.darkMode === true ? "dark" : null,
      body.darkMode === false ? "light" : null
    );

    const darkMode = normalizeBoolean(
      first(
        body.darkMode,
        body.isDark,
        rawTheme === "dark" ? true : null,
        rawTheme === "light" ? false : null
      ),
      false
    );

    const theme = darkMode ? "dark" : "light";

    output.darkMode = darkMode;
    output.theme = theme;
    output.mode = theme;
    output.appearance = theme;

    preferences.darkMode = darkMode;
    preferences.theme = theme;
    preferences.mode = theme;
    preferences.appearance = theme;
  }

  if (hasPrivacyMode) {
    const privacyMode = normalizeBoolean(
      first(body.privacyMode, body.privateMode, body.privacy),
      false
    );

    output.privacyMode = privacyMode;
    preferences.privacyMode = privacyMode;
  }

  if (hasLang) {
    const lang = normalizeLang(
      first(body.lang, body.language, body.locale, body.idioma, DEFAULT_LANG)
    );

    output.lang = lang;
    output.language = lang;
    output.locale = lang;
    output.idioma = lang;

    preferences.lang = lang;
    preferences.language = lang;
    preferences.locale = lang;
  }

  if (Object.keys(preferences).length) {
    output.preferences = {
      ...preferences,
      updatedAt: new Date().toISOString(),
    };
  }

  return cleanPayload(output);
}

function normalizeThemePayload(darkMode = true) {
  const enabled = normalizeBoolean(darkMode, true);
  const theme = enabled ? "dark" : "light";

  return {
    darkMode: enabled,
    theme,
    mode: theme,
    appearance: theme,
  };
}

function normalizePrivacyPayload(privacyMode = false) {
  return {
    privacyMode: normalizeBoolean(privacyMode, false),
  };
}

function normalizeLanguagePayload(lang = DEFAULT_LANG) {
  const nextLang = normalizeLang(lang);

  return {
    lang: nextLang,
    language: nextLang,
    locale: nextLang,
    idioma: nextLang,
  };
}

function normalizePasswordPayload(payload = {}) {
  const body = safeObject(payload);

  return cleanPayload({
    currentPassword: String(
      body.currentPassword ??
        body.current_password ??
        body.oldPassword ??
        body.old_password ??
        ""
    ),

    newPassword: String(
      body.newPassword ??
        body.new_password ??
        body.password ??
        body.pass ??
        ""
    ),

    confirmPassword: String(
      body.confirmPassword ??
        body.passwordConfirm ??
        body.repeatPassword ??
        body.password2 ??
        ""
    ),
  });
}

/* =========================================================
   RAW REQUESTS
========================================================= */

export async function fetchCuentaRequest({
  timeout = CUENTA_TIMEOUT,
  query = {},
} = {}) {
  try {
    const client = getHttpClient();

    const response = isFunction(client.me)
      ? await client.me({
          timeout,
          query,
          auth: true,
        })
      : await requestJson("GET", CUENTA_ENDPOINTS.me, {
          timeout,
          query,
        });

    return normalizeCuentaResponse(response, getCurrentCuentaFallback());
  } catch (error) {
    throw createCuentaError(error, "No se pudo cargar la cuenta.");
  }
}

export async function getCuentaByIdRequest(
  id = "",
  {
    timeout = CUENTA_DETAIL_TIMEOUT,
  } = {}
) {
  const cleanId = safeText(id, "");

  if (!cleanId) {
    return fetchCuentaRequest({
      timeout,
    });
  }

  try {
    const response = await requestJson("GET", getCuentaByIdEndpoint(cleanId), {
      timeout,
    });

    return normalizeCuentaResponse(response, getCurrentCuentaFallback());
  } catch (error) {
    throw createCuentaError(error, "No se pudo obtener el usuario.");
  }
}

export async function updateCuentaRequest(
  payload = {},
  {
    timeout = CUENTA_TIMEOUT,
    method = "PATCH",
  } = {}
) {
  const fallback = getCurrentCuentaFallback();
  const userId = resolveCuentaId({
    ...fallback,
    ...safeObject(payload),
  });

  if (!userId) {
    throw createCuentaError(
      {
        code: "CUENTA_USER_ID_MISSING",
        message: "No se pudo resolver el usuario de la cuenta.",
      },
      "No se pudo resolver el usuario de la cuenta."
    );
  }

  const body = normalizeCuentaUpdatePayload(payload);
  const httpMethod = safeText(method, "PATCH").toUpperCase() === "PUT" ? "PUT" : "PATCH";

  if (!Object.keys(body).length) {
    return normalizeCuentaDetail(fallback, {});
  }

  try {
    const response = await requestJson(httpMethod, getCuentaUpdateEndpoint(userId), {
      timeout,
      body,
    });

    return normalizeCuentaResponse(response, {
      ...fallback,
      ...body,
    });
  } catch (error) {
    throw createCuentaError(error, "No se pudo actualizar la cuenta.");
  }
}

export async function updateCuentaThemeRequest(
  darkMode = true,
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  return updateCuentaRequest(normalizeThemePayload(darkMode), {
    timeout,
  });
}

export async function toggleCuentaThemeRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  const current = normalizeCuentaDetail(getCurrentCuentaFallback(), {}) || {};
  const nextDarkMode = !normalizeBoolean(current.darkMode, false);

  return updateCuentaThemeRequest(nextDarkMode, {
    timeout,
  });
}

export async function updateCuentaPrivacyRequest(
  privacyMode = false,
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  return updateCuentaRequest(normalizePrivacyPayload(privacyMode), {
    timeout,
  });
}

export async function toggleCuentaPrivacyRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  const current = normalizeCuentaDetail(getCurrentCuentaFallback(), {}) || {};
  const nextPrivacyMode = !normalizeBoolean(current.privacyMode, false);

  return updateCuentaPrivacyRequest(nextPrivacyMode, {
    timeout,
  });
}

export async function updateCuentaLanguageRequest(
  lang = DEFAULT_LANG,
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  return updateCuentaRequest(normalizeLanguagePayload(lang), {
    timeout,
  });
}

export async function changePasswordRequest(
  payload = {},
  {
    timeout = CUENTA_TIMEOUT,
  } = {}
) {
  const body = normalizePasswordPayload(payload);

  try {
    const response = await requestJson("POST", CUENTA_ENDPOINTS.changePassword, {
      timeout,
      body,
    });

    const normalized = normalizeCuentaResponse(response, getCurrentCuentaFallback());

    if (normalized) {
      applyCuentaToCore(normalized);
    }

    return {
      ok: true,
      success: true,
      passwordChanged: response?.passwordChanged !== false,
      item: normalized,
      response,
    };
  } catch (error) {
    throw createCuentaError(error, "No se pudo cambiar la contraseña.");
  }
}

export async function uploadCuentaAvatarRequest(
  file,
  {
    timeout = CUENTA_UPLOAD_TIMEOUT,
    fieldName = "avatar",
  } = {}
) {
  if (!isBrowser() || typeof FormData === "undefined") {
    throw createCuentaError(
      {
        code: "FORM_DATA_UNAVAILABLE",
        message: "FormData no está disponible.",
      },
      "No se pudo preparar el avatar."
    );
  }

  if (!file) {
    throw createCuentaError(
      {
        code: "AVATAR_FILE_REQUIRED",
        message: "Selecciona una imagen de avatar.",
      },
      "Selecciona una imagen de avatar."
    );
  }

  const formData = new FormData();
  const filename = safeText(file?.name, "avatar");

  formData.append(fieldName, file, filename);

  try {
    const response = await requestJson("POST", CUENTA_ENDPOINTS.usersAvatar, {
      timeout,
      body: formData,
    });

    return normalizeCuentaResponse(response, getCurrentCuentaFallback());
  } catch (error) {
    throw createCuentaError(error, "No se pudo subir el avatar.");
  }
}

export async function deleteCuentaAvatarRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  try {
    const response = await requestJson("DELETE", CUENTA_ENDPOINTS.usersAvatar, {
      timeout,
    });

    return normalizeCuentaResponse(response, {
      ...getCurrentCuentaFallback(),
      avatar: "",
      avatarUrl: "",
      hasAvatar: false,
    });
  } catch (error) {
    throw createCuentaError(error, "No se pudo eliminar el avatar.");
  }
}

export async function fetchCuentaMetaRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  try {
    return requestJson("GET", CUENTA_ENDPOINTS.usersMeta, {
      timeout,
    });
  } catch (error) {
    throw createCuentaError(error, "No se pudo cargar la metadata de cuenta.");
  }
}

export async function fetchCuentaSessionsRequest({
  timeout = CUENTA_TIMEOUT,
} = {}) {
  try {
    return requestJson("GET", CUENTA_ENDPOINTS.usersSessions, {
      timeout,
    });
  } catch (error) {
    throw createCuentaError(error, "No se pudieron cargar las sesiones.");
  }
}

/* =========================================================
   PUBLIC FLOW
========================================================= */

export function hydrateCuentaFromCache() {
  return getCurrentCuentaFallback();
}

export async function loadCuenta({
  force = false,
  query = {},
  silent = false,
} = {}) {
  const loadToken = nextLoadToken();

  try {
    const detail = await fetchCuentaRequest({
      timeout: CUENTA_TIMEOUT,
      query: {
        ...safeObject(query),
        ...(force ? { _t: Date.now() } : {}),
        ...(silent ? { silent: "1" } : {}),
      },
    });

    if (!isActiveLoadToken(loadToken)) {
      return normalizeCuentaDetail(getCurrentCuentaFallback(), {});
    }

    applyCuentaToCore(detail);

    return detail;
  } catch (error) {
    if (!isActiveLoadToken(loadToken)) {
      return normalizeCuentaDetail(getCurrentCuentaFallback(), {});
    }

    throw error;
  }
}

export async function updateCuenta(payload = {}, options = {}) {
  const updated = await updateCuentaRequest(payload, options);

  applyCuentaToCore(updated);

  return updated;
}

export async function updateCuentaTheme(darkMode = true, options = {}) {
  const updated = await updateCuentaThemeRequest(darkMode, options);

  applyCuentaToCore(updated);

  return updated;
}

export async function toggleCuentaTheme(options = {}) {
  const updated = await toggleCuentaThemeRequest(options);

  applyCuentaToCore(updated);

  return updated;
}

export async function updateCuentaPrivacy(privacyMode = false, options = {}) {
  const updated = await updateCuentaPrivacyRequest(privacyMode, options);

  applyCuentaToCore(updated);

  return updated;
}

export async function toggleCuentaPrivacy(options = {}) {
  const updated = await toggleCuentaPrivacyRequest(options);

  applyCuentaToCore(updated);

  return updated;
}

export async function updateCuentaLanguage(lang = DEFAULT_LANG, options = {}) {
  const updated = await updateCuentaLanguageRequest(lang, options);

  applyCuentaToCore(updated);

  return updated;
}

export async function changePassword(payload = {}, options = {}) {
  return changePasswordRequest(payload, options);
}

export async function updatePassword(payload = {}, options = {}) {
  return changePassword(payload, options);
}

export async function savePassword(payload = {}, options = {}) {
  return changePassword(payload, options);
}

export async function uploadCuentaAvatar(file, options = {}) {
  const updated = await uploadCuentaAvatarRequest(file, options);

  applyCuentaToCore(updated);

  return updated;
}

export async function deleteCuentaAvatar(options = {}) {
  const updated = await deleteCuentaAvatarRequest(options);

  applyCuentaToCore(updated);

  return updated;
}

export async function loadCuentaMeta(options = {}) {
  return fetchCuentaMetaRequest(options);
}

export async function loadCuentaSessions(options = {}) {
  return fetchCuentaSessionsRequest(options);
}

/* =========================================================
   ALIASES ESTABLES
========================================================= */

export const getCuenta = loadCuenta;
export const fetchCuenta = loadCuenta;
export const refreshCuenta = loadCuenta;
export const reloadCuenta = loadCuenta;

export const saveCuenta = updateCuenta;
export const save = updateCuenta;
export const saveProfile = updateCuenta;
export const savePerfil = updateCuenta;
export const updateProfile = updateCuenta;
export const updatePerfil = updateCuenta;

export const updateTheme = updateCuentaTheme;
export const setTheme = updateCuentaTheme;
export const setCuentaTheme = updateCuentaTheme;

export const updateLanguage = updateCuentaLanguage;
export const setLanguage = updateCuentaLanguage;
export const setCuentaLanguage = updateCuentaLanguage;

export const updatePrivacy = updateCuentaPrivacy;
export const setPrivacy = updateCuentaPrivacy;
export const setCuentaPrivacy = updateCuentaPrivacy;

/* =========================================================
   SNAPSHOT
========================================================= */

export function getCuentaApiSnapshot() {
  const current = getCurrentCuentaFallback();

  return {
    version: CUENTA_API_VERSION,
    resource: CUENTA_RESOURCE,

    endpoints: {
      ...CUENTA_ENDPOINTS,
    },

    hasHttp: Boolean(getHttpClient()),
    hasCurrentUser: Boolean(current?.userId || current?.id),

    current: current
      ? {
          userId: current.userId ? "***" : "",
          id: current.id ? "***" : "",
          username: current.username || "",
          email: current.email ? "***" : "",
          role: current.role || "",
          status: current.status || "",
          avatar: current.avatarUrl ? "set" : "",
        }
      : null,

    policy: {
      singleHttpClient: true,
      noStorage: true,
      noLocalStore: true,
      noRawFetch: true,
      noGlobalBridge: true,
      noLegacyPreferencesEndpoint: true,
    },
  };
}

export const getSnapshot = getCuentaApiSnapshot;
export const snapshot = getCuentaApiSnapshot;

/* =========================================================
   PUBLIC API OBJECT
========================================================= */

export const CuentaApi = Object.freeze({
  version: CUENTA_API_VERSION,
  resource: CUENTA_RESOURCE,

  endpoints: CUENTA_ENDPOINTS,

  endpoint: CUENTA_ENDPOINT,
  altEndpoint: CUENTA_ALT_ENDPOINT,

  timeout: CUENTA_TIMEOUT,
  detailTimeout: CUENTA_DETAIL_TIMEOUT,
  uploadTimeout: CUENTA_UPLOAD_TIMEOUT,

  normalizeCuentaDetail,

  getCuentaEndpoint,
  getCuentaAltEndpoint,
  getCuentaByIdEndpoint,
  getCuentaUpdateEndpoint,

  getCuentaThemeEndpoint,
  getCuentaThemeToggleEndpoint,
  getCuentaPrivacyEndpoint,
  getCuentaPrivacyToggleEndpoint,
  getCuentaLanguageEndpoint,
  getCuentaLangEndpoint,

  getCuentaMetaEndpoint,
  getCuentaAvatarEndpoint,
  getCuentaSessionsEndpoint,
  getCuentaChangePasswordEndpoint,

  hydrateCuentaFromCache,

  fetchCuentaRequest,
  getCuentaByIdRequest,
  updateCuentaRequest,
  updateCuentaThemeRequest,
  toggleCuentaThemeRequest,
  updateCuentaPrivacyRequest,
  toggleCuentaPrivacyRequest,
  updateCuentaLanguageRequest,
  changePasswordRequest,
  uploadCuentaAvatarRequest,
  deleteCuentaAvatarRequest,
  fetchCuentaMetaRequest,
  fetchCuentaSessionsRequest,

  loadCuenta,
  getCuenta,
  fetchCuenta,
  refreshCuenta,
  reloadCuenta,

  updateCuenta,
  saveCuenta,
  save,
  saveProfile,
  savePerfil,
  updateProfile,
  updatePerfil,

  updateCuentaTheme,
  toggleCuentaTheme,
  updateTheme,
  setTheme,
  setCuentaTheme,

  updateCuentaPrivacy,
  toggleCuentaPrivacy,
  updatePrivacy,
  setPrivacy,
  setCuentaPrivacy,

  updateCuentaLanguage,
  updateLanguage,
  setLanguage,
  setCuentaLanguage,

  changePassword,
  updatePassword,
  savePassword,

  uploadCuentaAvatar,
  deleteCuentaAvatar,

  loadCuentaMeta,
  loadCuentaSessions,

  getCuentaApiSnapshot,
  getSnapshot,
  snapshot,
});

export default CuentaApi;

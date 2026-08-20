/* =========================================================
   Onion Support - Cuenta API
   Archivo: /src/views/cuenta/cuenta.api.js

   PRODUCTIVO · SELF ACCOUNT · BACKEND CONTRACT REAL · V3

   Backend self-service real:
   - GET    /api/auth/me
   - POST   /api/auth/change-password
   - POST   /api/auth/deactivate/self
   - POST   /api/users/avatar
   - DELETE /api/users/avatar
   - GET    /api/users/sessions
   - GET    /api/auth/_meta

   Contrato:
   - Cuenta es self-only; /api/users/:id sigue siendo admin-only.
   - No existe PATCH/PUT self de perfil/preferencias.
   - Un único cliente HTTP: core/http.js.
   - Sin localStorage, tokens manuales ni endpoint discovery.
   - SAS de Azure Blob permitido sólo para avatar y sólo en runtime.
   - Session IDs no salen del normalizador de sesiones.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";
import { sanitizeRuntimeImageUrl } from "../../core/media.js";

export const CUENTA_API_VERSION =
  "cuenta.api.backend-contract.v4-canonical-role";

export const CUENTA_RESOURCE = "cuenta";

export const CUENTA_ENDPOINTS = Object.freeze({
  me: "/api/auth/me",
  authMeta: "/api/auth/_meta",
  changePassword: "/api/auth/change-password",
  deactivateSelf: "/api/auth/deactivate/self",
  usersSessions: "/api/users/sessions",
  usersAvatar: "/api/users/avatar",
  users: "/api/users",
  usersMeta: "/api/users/_meta",
});

export const CUENTA_ENDPOINT = CUENTA_ENDPOINTS.me;
export const CUENTA_ALT_ENDPOINT = CUENTA_ENDPOINTS.users;

export const CUENTA_TIMEOUT = 30_000;
export const CUENTA_DETAIL_TIMEOUT = 30_000;
export const CUENTA_UPLOAD_TIMEOUT = 60_000;
export const CUENTA_SELF_UPDATE_SUPPORTED = false;

export const CUENTA_PASSWORD_POLICY = Object.freeze({
  minLength: 10,
  maxLength: 256,
  requiresLowercase: true,
  requiresUppercase: true,
  requiresNumber: true,
  requiresSymbol: true,
  currentPasswordRequiredByDefault: false,
});

export const CUENTA_AVATAR_POLICY = Object.freeze({
  fieldName: "avatar",
  maxBytes: 2 * 1024 * 1024,
  allowedMimeTypes: Object.freeze([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/avif",
  ]),
});

const DEFAULT_LANG = "es";
const DEFAULT_THEME = "light";
const DEFAULT_ROLE = "user";

let inflightMe = null;
let lastLoadToken = 0;

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

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value = "", fallback = "") {
  if (value === null || value === undefined) return fallback;
  const output = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return output || fallback;
}

function safeLower(value = "", fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function first(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isPlainObject(value) && Object.keys(value).length === 0) continue;
    return value;
  }
  return null;
}

function normalizeKey(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w:.]/g, "")
    .replace(/^_+|_+$/g, "");
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  const key = normalizeKey(value);
  if (["true", "1", "yes", "y", "si", "on", "enabled", "active", "dark"].includes(key)) {
    return true;
  }
  if (["false", "0", "no", "n", "off", "disabled", "inactive", "light"].includes(key)) {
    return false;
  }
  return Boolean(fallback);
}

function normalizeLang(value = DEFAULT_LANG) {
  const key = normalizeKey(value);
  if (["en", "eng", "english", "en_us", "en_gb"].includes(key)) return "en";
  if (["ca", "cat", "catala", "catalan", "ca_es"].includes(key)) return "ca";
  return "es";
}

function normalizeStatus(source = {}) {
  const object = safeObject(source);

  if (
    object.deleted === true ||
    object.archived === true ||
    object.active === false ||
    object.enabled === false ||
    object.disabled === true
  ) {
    return "disabled";
  }

  const status = normalizeKey(first(object.status, object.estado, "active"));
  if (["disabled", "inactive", "blocked", "suspended", "deleted", "archived"].includes(status)) {
    return "disabled";
  }
  if (status === "pending") return "pending";
  return "active";
}

function normalizeDireccion(value = {}) {
  const source = safeObject(value);
  return {
    calle: safeText(first(source.calle, source.line1, source.street, ""), ""),
    cp: safeText(first(source.cp, source.postalCode, source.zip, ""), ""),
    ciudad: safeText(first(source.ciudad, source.city, ""), ""),
    provincia: safeText(first(source.provincia, source.province, source.state, ""), ""),
    pais: safeText(first(source.pais, source.country, ""), ""),
  };
}

function sanitizePermissions(value = []) {
  const seen = new Set();
  const output = [];

  for (const permission of safeArray(value)) {
    const clean = safeText(permission, "").slice(0, 120);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }

  return output;
}

function nextLoadToken() {
  lastLoadToken += 1;
  return lastLoadToken;
}

function isActiveLoadToken(token) {
  return token === lastLoadToken;
}

function getErrorStatus(error = null) {
  return Number(first(
    error?.status,
    error?.statusCode,
    error?.response?.status,
    error?.payload?.status,
    error?.data?.status,
    0
  )) || 0;
}

function getErrorCode(error = null) {
  return safeText(first(
    error?.code,
    error?.error,
    error?.payload?.code,
    error?.payload?.error,
    error?.data?.code,
    error?.data?.error,
    error?.response?.code,
    error?.response?.error,
    ""
  ), "");
}

function normalizeErrorMessage(error = null, fallback = "Error de cuenta.") {
  return safeText(first(
    error?.payload?.message,
    error?.data?.message,
    error?.response?.data?.message,
    error?.response?.message,
    error?.message,
    error?.error,
    error?.code,
    fallback
  ), fallback);
}

function createCuentaError(error = null, fallback = "Error de cuenta.") {
  const normalized = new Error(normalizeErrorMessage(error, fallback));
  normalized.name = "CuentaApiError";
  normalized.code = getErrorCode(error) || "CUENTA_API_ERROR";
  normalized.status = getErrorStatus(error);
  normalized.statusCode = normalized.status;
  return normalized;
}

function unsupportedSelfUpdateError() {
  return createCuentaError({
    code: "CUENTA_SELF_UPDATE_NOT_SUPPORTED",
    status: 405,
    message: "El backend actual no expone una ruta self para guardar nombre, teléfono, apariencia, idioma o privacidad.",
  });
}

function crossUserReadError() {
  return createCuentaError({
    code: "CUENTA_CROSS_USER_READ_NOT_SUPPORTED",
    status: 403,
    message: "La vista Cuenta solo puede consultar al usuario autenticado.",
  });
}

function getCoreState() {
  try {
    return safeObject(AppCore?.getState?.(), {});
  } catch {
    return safeObject(AppCore?.state, {});
  }
}

function getCurrentCoreUser() {
  try {
    return safeObject(first(
      AppCore?.getCurrentUser?.(),
      getCoreState().user,
      getCoreState().currentUser,
      {}
    ), {});
  } catch {
    return safeObject(first(getCoreState().user, getCoreState().currentUser, {}), {});
  }
}

function looksLikeUser(value = {}) {
  const source = safeObject(value);
  return Boolean(
    source.userId || source.id || source.uid || source.email ||
    source.username || source.name || source.slug || source.avatar || source.avatarUrl
  );
}

function extractUser(payload = null) {
  const root = safeObject(payload);
  const data = safeObject(root.data);
  const auth = safeObject(root.auth);

  return safeObject(first(
    root.user, root.me, root.account, root.profile,
    data.user, data.me, data.account, data.profile,
    auth.user, auth.me,
    looksLikeUser(root) ? root : null
  ), {});
}

function extractPreferences(payload = null, user = {}) {
  const root = safeObject(payload);
  const data = safeObject(root.data);
  const auth = safeObject(root.auth);
  return {
    ...safeObject(user.preferences),
    ...safeObject(first(root.preferences, data.preferences, auth.preferences, {})),
  };
}

function extractRouting(payload = null) {
  const root = safeObject(payload);
  const data = safeObject(root.data);
  const auth = safeObject(root.auth);
  return safeObject(first(root.routing, data.routing, auth.routing, {}), {});
}

function extractCliente(payload = null) {
  const root = safeObject(payload);
  const data = safeObject(root.data);
  return safeObject(first(
    root.cliente, root.client, root.customer,
    data.cliente, data.client, data.customer,
    {}
  ), {});
}

export function normalizeCuentaDetail(payload = {}, fallback = {}) {
  const fallbackUser = extractUser(fallback);
  const user = extractUser(payload);
  const source = { ...fallbackUser, ...user };

  if (!looksLikeUser(source)) return null;

  const preferences = {
    ...extractPreferences(fallback, fallbackUser),
    ...extractPreferences(payload, user),
  };
  const routing = { ...extractRouting(fallback), ...extractRouting(payload) };
  const cliente = { ...extractCliente(fallback), ...extractCliente(payload) };

  const userId = safeText(first(source.userId, source.id, source.uid, source.sub, ""), "");
  const id = safeText(first(source.id, userId, ""), "");
  const email = safeLower(first(source.email, source.emailLower, ""), "");
  const username = safeText(first(source.username, source.usernameLower, ""), "");
  const slug = safeLower(first(routing.slug, source.slug, username, ""), "").replace(/^@+/, "");
  const name = safeText(first(
    source.name, source.displayName, source.fullName, source.nombre,
    username, email, "Usuario Onion"
  ), "Usuario Onion");
  const phone = safeText(first(source.phone, source.telefono, ""), "");
  const role = AppCore.normalizeRole(first(source.role, source.rol, safeArray(source.roles)[0], DEFAULT_ROLE)) || DEFAULT_ROLE;
  const status = normalizeStatus(source);
  const active = status === "active";
  const tipo = normalizeKey(source.tipo) === "empresa" ? "empresa" : "particular";
  const nif = safeText(first(source.nif, source.cif, ""), "").toUpperCase();
  const clienteId = safeText(first(
    source.clienteId, source.clientId, source.customerId,
    cliente.clienteId, cliente.clientId, cliente.customerId, cliente.id,
    ""
  ), "");
  const avatarUrl = sanitizeRuntimeImageUrl(first(source.avatarUrl, source.avatar, source.picture, ""));

  const darkMode = normalizeBoolean(first(preferences.darkMode, source.darkMode, false), false);
  const privacyMode = normalizeBoolean(first(preferences.privacyMode, source.privacyMode, false), false);
  const themeKey = normalizeKey(first(
    preferences.theme, source.theme, source.mode, source.appearance,
    darkMode ? "dark" : DEFAULT_THEME
  ));
  const theme = themeKey === "dark" ? "dark" : "light";
  const lang = normalizeLang(first(
    preferences.lang, preferences.language, preferences.locale,
    source.lang, source.language, source.locale, DEFAULT_LANG
  ));
  const direccion = normalizeDireccion(first(source.direccion, source.address, {}));
  const permissions = sanitizePermissions(first(source.permissions, source.permisos, []));

  const canonicalPreferences = {
    darkMode,
    privacyMode,
    theme,
    mode: theme,
    appearance: theme,
    lang,
    language: lang,
    locale: lang,
    timezone: safeText(first(preferences.timezone, source.timezone, "Europe/Madrid"), "Europe/Madrid"),
    dateFormat: safeText(preferences.dateFormat, "dd/MM/yyyy"),
    timeFormat: safeText(preferences.timeFormat, "24h"),
    currency: safeText(preferences.currency, "EUR"),
    sidebarCollapsed: normalizeBoolean(preferences.sidebarCollapsed, false),
    compactMode: normalizeBoolean(preferences.compactMode, false),
    reducedMotion: normalizeBoolean(preferences.reducedMotion, false),
    notifications: safeObject(preferences.notifications),
    updatedAt: first(preferences.updatedAt, source.preferencesUpdatedAt, source.updatedAt, null),
  };

  const safeProfile = {
    name,
    displayName: name,
    fullName: name,
    email,
    username,
    phone,
    telefono: phone,
    avatar: avatarUrl,
    avatarUrl,
  };

  const safeCliente = Object.keys(cliente).length
    ? {
        id: safeText(first(cliente.id, clienteId, ""), ""),
        clienteId,
        nombreFiscal: safeText(first(cliente.nombreFiscal, cliente.name, ""), ""),
        tipo: normalizeKey(cliente.tipo) === "empresa"
          ? "empresa"
          : normalizeKey(cliente.tipo) === "particular" ? "particular" : "",
        active: cliente.active === true,
      }
    : null;

  const accountSubset = {
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
    clienteId,
    darkMode,
    privacyMode,
    theme,
    lang,
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
    usernameLower: safeLower(first(source.usernameLower, username), ""),
    slug,
    name,
    nombre: name,
    displayName: name,
    fullName: name,
    phone,
    telefono: phone,
    mobile: phone,
    role,
    rol: role,
    roles: [role],
    permissions,
    permisos: permissions,
    status,
    estado: status,
    active,
    enabled: active,
    disabled: !active,
    usable: active,
    tipo,
    nif,
    clienteId,
    clientId: clienteId,
    customerId: clienteId,
    direccion,
    address: direccion,
    hasAvatar: Boolean(avatarUrl && source.hasAvatar !== false),
    avatar: avatarUrl,
    avatarUrl,
    picture: avatarUrl,
    avatarUpdatedAt: first(source.avatarUpdatedAt, null),
    darkMode,
    privacyMode,
    theme,
    mode: theme,
    appearance: theme,
    lang,
    language: lang,
    locale: lang,
    idioma: lang,
    timezone: canonicalPreferences.timezone,
    emailVerified: source.emailVerified === true,
    createdAt: first(source.createdAt, null),
    updatedAt: first(source.updatedAt, source.updated_at, null),
    lastLoginAt: first(source.lastLoginAt, null),
    lastSeenAt: first(source.lastSeenAt, null),
    lastPasswordChangeAt: first(source.lastPasswordChangeAt, null),
    preferences: canonicalPreferences,
    settings: canonicalPreferences,
    routing: {
      slug,
      homePath: safeText(first(routing.homePath, routing.publicPath, ""), ""),
      canonicalPath: safeText(first(routing.canonicalPath, routing.publicPath, ""), ""),
      publicPath: safeText(routing.publicPath, ""),
    },
    cliente: safeCliente,
    profile: safeProfile,
    user: { ...accountSubset },
    account: { ...accountSubset },
  };
}

function getCurrentCuentaFallback() {
  return normalizeCuentaDetail(getCurrentCoreUser(), {}) || null;
}

function applyCuentaToCore(item = null) {
  const detail = normalizeCuentaDetail(item, getCurrentCoreUser());
  if (!detail) return null;

  try {
    const previous = getCurrentCoreUser();
    AppCore?.setUser?.({
      ...previous,
      id: detail.id,
      userId: detail.userId,
      uid: detail.userId,
      username: detail.username,
      usernameLower: detail.usernameLower,
      slug: detail.slug,
      name: detail.name,
      displayName: detail.displayName,
      fullName: detail.fullName,
      email: detail.email,
      emailLower: detail.emailLower,
      phone: detail.phone,
      avatar: detail.avatarUrl,
      avatarUrl: detail.avatarUrl,
      picture: detail.avatarUrl,
      hasAvatar: detail.hasAvatar,
      role: detail.role,
      rol: detail.role,
      roles: detail.roles,
      status: detail.status,
      active: detail.active,
      clienteId: detail.clienteId,
      darkMode: detail.darkMode,
      privacyMode: detail.privacyMode,
      theme: detail.theme,
      lang: detail.lang,
      preferences: detail.preferences,
    });
  } catch {
    // El bridge de UI no invalida la operación de Cuenta.
  }

  return detail;
}

async function requestJson(method = "GET", endpoint = "", {
  body,
  query,
  timeout = CUENTA_TIMEOUT,
  source = "views.cuenta.api",
} = {}) {
  const verb = safeText(method, "GET").toUpperCase();
  const path = safeText(endpoint, "");

  if (!path) {
    throw createCuentaError({
      code: "CUENTA_ENDPOINT_REQUIRED",
      status: 500,
      message: "Falta endpoint de cuenta.",
    });
  }

  const options = {
    timeout,
    auth: true,
    source: safeText(source, "views.cuenta.api"),
  };

  if (query && Object.keys(safeObject(query)).length) {
    options.query = safeObject(query);
  }

  if (verb === "GET" && isFunction(Http?.get)) return Http.get(path, options);
  if (verb === "POST" && isFunction(Http?.post)) return Http.post(path, body, options);

  if (verb === "DELETE") {
    const deleteFn = Http?.del || Http?.delete;
    if (isFunction(deleteFn)) return deleteFn.call(Http, path, options);
  }

  throw createCuentaError({
    code: "CUENTA_HTTP_METHOD_UNAVAILABLE",
    status: 500,
    message: `El cliente HTTP no expone ${verb}.`,
  });
}

export function getCuentaEndpoint() { return CUENTA_ENDPOINTS.me; }
export function getCuentaAltEndpoint() { return CUENTA_ENDPOINTS.users; }

export function getCuentaByIdEndpoint(id = "") {
  const requested = safeText(id, "");
  if (!requested) return CUENTA_ENDPOINTS.me;

  const current = getCurrentCuentaFallback();
  const currentId = safeText(first(current?.userId, current?.id, ""), "");
  return currentId && requested === currentId ? CUENTA_ENDPOINTS.me : "";
}

export function getCuentaUpdateEndpoint() { return ""; }
export function getCuentaThemeEndpoint() { return ""; }
export function getCuentaThemeToggleEndpoint() { return ""; }
export function getCuentaPrivacyEndpoint() { return ""; }
export function getCuentaPrivacyToggleEndpoint() { return ""; }
export function getCuentaLanguageEndpoint() { return ""; }
export function getCuentaLangEndpoint() { return ""; }
export function getCuentaMetaEndpoint() { return CUENTA_ENDPOINTS.authMeta; }
export function getCuentaAvatarEndpoint() { return CUENTA_ENDPOINTS.usersAvatar; }
export function getCuentaSessionsEndpoint() { return CUENTA_ENDPOINTS.usersSessions; }
export function getCuentaChangePasswordEndpoint() { return CUENTA_ENDPOINTS.changePassword; }
export function getCuentaDeactivateEndpoint() { return CUENTA_ENDPOINTS.deactivateSelf; }

function hasMutationPayload(payload = {}) {
  return isPlainObject(payload) && Object.keys(payload).some((key) => payload[key] !== undefined);
}

export function assertCuentaSelfUpdateSupported(payload = {}) {
  if (!hasMutationPayload(payload)) return true;
  throw unsupportedSelfUpdateError();
}

function normalizePasswordPayload(payload = {}) {
  const body = safeObject(payload);
  return {
    currentPassword: String(first(
      body.currentPassword, body.current_password, body.oldPassword, body.old_password, ""
    ) ?? ""),
    newPassword: String(first(
      body.newPassword, body.new_password, body.password, body.pass, ""
    ) ?? ""),
    confirmPassword: String(first(
      body.confirmPassword, body.passwordConfirm, body.repeatPassword, body.password2, ""
    ) ?? ""),
  };
}

export function validateCuentaPasswordPayload(payload = {}) {
  const body = normalizePasswordPayload(payload);
  const password = body.newPassword;

  if (!password.trim()) {
    return { ok: false, code: "INVALID_INPUT", message: "Introduce una nueva contraseña." };
  }
  if (password.length < CUENTA_PASSWORD_POLICY.minLength) {
    return {
      ok: false,
      code: "WEAK_PASSWORD",
      message: `La contraseña debe tener al menos ${CUENTA_PASSWORD_POLICY.minLength} caracteres.`,
    };
  }
  if (password.length > CUENTA_PASSWORD_POLICY.maxLength) {
    return { ok: false, code: "PASSWORD_TOO_LONG", message: "La contraseña es demasiado larga." };
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z\d]/.test(password)) {
    return {
      ok: false,
      code: "WEAK_PASSWORD",
      message: "La contraseña debe incluir mayúscula, minúscula, número y símbolo.",
    };
  }
  if (body.confirmPassword && body.confirmPassword !== password) {
    return { ok: false, code: "PASSWORD_MISMATCH", message: "Las contraseñas no coinciden." };
  }

  return { ok: true, body };
}

export function validateCuentaAvatarFile(file = null) {
  if (!file) {
    return { ok: false, code: "AVATAR_FILE_REQUIRED", message: "Selecciona una imagen de avatar." };
  }

  const size = Number(file?.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "El archivo está vacío." };
  }
  if (size > CUENTA_AVATAR_POLICY.maxBytes) {
    return { ok: false, code: "FILE_TOO_LARGE", message: "El avatar supera el tamaño máximo permitido." };
  }

  const mimeType = safeLower(file?.type, "");
  if (!CUENTA_AVATAR_POLICY.allowedMimeTypes.includes(mimeType)) {
    return { ok: false, code: "INVALID_TYPE", message: "Tipo de avatar no permitido." };
  }

  return { ok: true, mimeType, size };
}

function normalizeSession(session = {}) {
  const source = safeObject(session);

  /*
    El backend usa sessionId como identidad interna, pero Cuenta no
    necesita exponerlo: no hay acciones por sesión en este contrato.
  */
  return {
    device: safeText(source.device, "Unknown device"),
    ip: safeText(source.ip, "unknown"),
    location: safeText(source.location, ""),
    country: safeText(source.country, ""),
    createdAt: first(source.createdAt, null),
    lastActiveAt: first(source.lastActiveAt, null),
    isCurrent: source.isCurrent === true,
  };
}

export function normalizeCuentaSessionsResponse(payload = {}) {
  const root = safeObject(payload);
  const data = safeObject(root.data);
  const sessions = safeArray(first(root.sessions, data.sessions, []))
    .filter(isPlainObject)
    .map(normalizeSession);

  return {
    ok: root.ok !== false,
    sessions,
    count: sessions.length,
  };
}

export async function fetchCuentaRequest({ timeout = CUENTA_TIMEOUT, force = false } = {}) {
  if (inflightMe && !force) return inflightMe;

  let task = null;
  task = (async () => {
    try {
      const response = await requestJson("GET", CUENTA_ENDPOINTS.me, {
        timeout,
        source: "views.cuenta.api.me",
      });

      const detail = normalizeCuentaDetail(response, getCurrentCoreUser());
      if (!detail) {
        throw createCuentaError({
          code: "CUENTA_ME_INVALID_RESPONSE",
          status: 502,
          message: "El backend no devolvió una cuenta válida.",
        });
      }
      return detail;
    } catch (error) {
      if (error?.name === "CuentaApiError") throw error;
      throw createCuentaError(error, "No se pudo cargar la cuenta.");
    } finally {
      if (inflightMe === task) inflightMe = null;
    }
  })();

  if (!force) inflightMe = task;
  return task;
}

export async function getCuentaByIdRequest(id = "", { timeout = CUENTA_DETAIL_TIMEOUT } = {}) {
  const endpoint = getCuentaByIdEndpoint(id);
  if (!endpoint) throw crossUserReadError();
  return fetchCuentaRequest({ timeout, force: true });
}

export async function updateCuentaRequest(payload = {}) {
  if (!hasMutationPayload(payload)) return getCurrentCuentaFallback();
  throw unsupportedSelfUpdateError();
}

export async function updateCuentaThemeRequest(darkMode = true) {
  return updateCuentaRequest({ darkMode: normalizeBoolean(darkMode, true) });
}

export async function toggleCuentaThemeRequest() {
  const current = getCurrentCuentaFallback();
  return updateCuentaThemeRequest(!normalizeBoolean(current?.darkMode, false));
}

export async function updateCuentaPrivacyRequest(privacyMode = false) {
  return updateCuentaRequest({ privacyMode: normalizeBoolean(privacyMode, false) });
}

export async function toggleCuentaPrivacyRequest() {
  const current = getCurrentCuentaFallback();
  return updateCuentaPrivacyRequest(!normalizeBoolean(current?.privacyMode, false));
}

export async function updateCuentaLanguageRequest(lang = DEFAULT_LANG) {
  return updateCuentaRequest({ lang: normalizeLang(lang) });
}

export async function changePasswordRequest(payload = {}, { timeout = CUENTA_TIMEOUT } = {}) {
  const validation = validateCuentaPasswordPayload(payload);
  if (!validation.ok) {
    throw createCuentaError({
      code: validation.code,
      status: 400,
      message: validation.message,
    });
  }

  try {
    const response = await requestJson("POST", CUENTA_ENDPOINTS.changePassword, {
      timeout,
      body: validation.body,
      source: "views.cuenta.api.password",
    });

    const item = normalizeCuentaDetail(response, getCurrentCoreUser());
    if (item) applyCuentaToCore(item);

    const versionChanged =
      response?.tokenVersion !== undefined &&
      response?.previousTokenVersion !== undefined &&
      Number(response.tokenVersion) !== Number(response.previousTokenVersion);

    return {
      ok: response?.ok !== false,
      success: response?.success !== false,
      code: safeText(response?.code, "PASSWORD_CHANGED"),
      message: safeText(response?.message, "Contraseña actualizada correctamente."),
      passwordChanged: response?.passwordChanged !== false,
      authRefreshRequired: versionChanged,
      item,
    };
  } catch (error) {
    if (error?.name === "CuentaApiError") throw error;
    throw createCuentaError(error, "No se pudo cambiar la contraseña.");
  }
}

export async function uploadCuentaAvatarRequest(file, { timeout = CUENTA_UPLOAD_TIMEOUT } = {}) {
  if (!isBrowser() || typeof FormData === "undefined") {
    throw createCuentaError({
      code: "FORM_DATA_UNAVAILABLE",
      status: 500,
      message: "FormData no está disponible.",
    }, "No se pudo preparar el avatar.");
  }

  const validation = validateCuentaAvatarFile(file);
  if (!validation.ok) {
    throw createCuentaError({
      code: validation.code,
      status: 400,
      message: validation.message,
    });
  }

  const formData = new FormData();
  formData.append(
    CUENTA_AVATAR_POLICY.fieldName,
    file,
    safeText(file?.name, "avatar")
  );

  try {
    const response = await requestJson("POST", CUENTA_ENDPOINTS.usersAvatar, {
      timeout,
      body: formData,
      source: "views.cuenta.api.avatar.upload",
    });

    const returnedAvatar = sanitizeRuntimeImageUrl(first(response?.avatarUrl, response?.avatar, ""));
    return normalizeCuentaDetail(response, {
      ...getCurrentCoreUser(),
      avatar: returnedAvatar,
      avatarUrl: returnedAvatar,
      hasAvatar: Boolean(returnedAvatar),
    });
  } catch (error) {
    if (error?.name === "CuentaApiError") throw error;
    throw createCuentaError(error, "No se pudo subir el avatar.");
  }
}

export async function deleteCuentaAvatarRequest({ timeout = CUENTA_TIMEOUT } = {}) {
  try {
    const response = await requestJson("DELETE", CUENTA_ENDPOINTS.usersAvatar, {
      timeout,
      source: "views.cuenta.api.avatar.delete",
    });

    return normalizeCuentaDetail(response, {
      ...getCurrentCoreUser(),
      avatar: "",
      avatarUrl: "",
      picture: "",
      hasAvatar: false,
    });
  } catch (error) {
    if (error?.name === "CuentaApiError") throw error;
    throw createCuentaError(error, "No se pudo eliminar el avatar.");
  }
}

export async function fetchCuentaMetaRequest({ timeout = CUENTA_TIMEOUT } = {}) {
  try {
    return await requestJson("GET", CUENTA_ENDPOINTS.authMeta, {
      timeout,
      source: "views.cuenta.api.meta",
    });
  } catch (error) {
    throw createCuentaError(error, "No se pudo cargar la metadata de cuenta.");
  }
}

export async function fetchCuentaSessionsRequest({ timeout = CUENTA_TIMEOUT } = {}) {
  try {
    const response = await requestJson("GET", CUENTA_ENDPOINTS.usersSessions, {
      timeout,
      source: "views.cuenta.api.sessions",
    });
    return normalizeCuentaSessionsResponse(response);
  } catch (error) {
    throw createCuentaError(error, "No se pudieron cargar las sesiones.");
  }
}

export async function deactivateCuentaRequest(payload = {}, { timeout = CUENTA_TIMEOUT } = {}) {
  const password = String(safeObject(payload).password ?? "");

  if (!password.trim()) {
    throw createCuentaError({
      code: "PASSWORD_REQUIRED",
      status: 400,
      message: "Debes introducir tu contraseña.",
    });
  }

  if (password.length > 1024) {
    throw createCuentaError({
      code: "INVALID_PASSWORD_SIZE",
      status: 400,
      message: "Contraseña inválida.",
    });
  }

  try {
    const response = await requestJson("POST", CUENTA_ENDPOINTS.deactivateSelf, {
      timeout,
      body: { password },
      source: "views.cuenta.api.deactivate",
    });

    const item = normalizeCuentaDetail(response, {
      ...getCurrentCoreUser(),
      active: false,
      enabled: false,
      disabled: true,
      status: "disabled",
    });

    return {
      ok: response?.ok !== false,
      success: response?.success !== false,
      code: safeText(response?.code, "ACCOUNT_DEACTIVATED"),
      message: safeText(response?.message, "Cuenta desactivada correctamente."),
      deactivated: response?.deactivated === true,
      alreadyDisabled: response?.alreadyDisabled === true,
      loggedOut: response?.loggedOut === true || response?.logout === true,
      item,
    };
  } catch (error) {
    if (error?.name === "CuentaApiError") throw error;
    throw createCuentaError(error, "No se pudo desactivar la cuenta.");
  }
}

export function hydrateCuentaFromCache() {
  return getCurrentCuentaFallback();
}

export async function loadCuenta({ force = false } = {}) {
  const loadToken = nextLoadToken();

  try {
    const detail = await fetchCuentaRequest({
      timeout: CUENTA_TIMEOUT,
      force: Boolean(force),
    });

    if (!isActiveLoadToken(loadToken)) return getCurrentCuentaFallback();
    applyCuentaToCore(detail);
    return detail;
  } catch (error) {
    if (!isActiveLoadToken(loadToken)) return getCurrentCuentaFallback();
    throw error;
  }
}

export async function updateCuenta(payload = {}, options = {}) {
  const updated = await updateCuentaRequest(payload, options);
  if (updated) applyCuentaToCore(updated);
  return updated;
}

export async function updateCuentaTheme(darkMode = true, options = {}) {
  return updateCuentaThemeRequest(darkMode, options);
}

export async function toggleCuentaTheme(options = {}) {
  return toggleCuentaThemeRequest(options);
}

export async function updateCuentaPrivacy(privacyMode = false, options = {}) {
  return updateCuentaPrivacyRequest(privacyMode, options);
}

export async function toggleCuentaPrivacy(options = {}) {
  return toggleCuentaPrivacyRequest(options);
}

export async function updateCuentaLanguage(lang = DEFAULT_LANG, options = {}) {
  return updateCuentaLanguageRequest(lang, options);
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
  if (updated) applyCuentaToCore(updated);
  return updated;
}

export async function deleteCuentaAvatar(options = {}) {
  const updated = await deleteCuentaAvatarRequest(options);
  if (updated) applyCuentaToCore(updated);
  return updated;
}

export async function loadCuentaMeta(options = {}) {
  return fetchCuentaMetaRequest(options);
}

export async function loadCuentaSessions(options = {}) {
  return fetchCuentaSessionsRequest(options);
}

export async function deactivateCuenta(payload = {}, options = {}) {
  return deactivateCuentaRequest(payload, options);
}

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

export function getCuentaApiSnapshot() {
  const current = getCurrentCuentaFallback();

  return {
    version: CUENTA_API_VERSION,
    resource: CUENTA_RESOURCE,
    endpoints: { ...CUENTA_ENDPOINTS },
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
    capabilities: {
      readSelf: true,
      updateSelfProfile: false,
      updateSelfTheme: false,
      updateSelfPrivacy: false,
      updateSelfLanguage: false,
      changePassword: true,
      avatarUpload: true,
      avatarDelete: true,
      sessionsRead: true,
      deactivateSelf: true,
    },
    policies: {
      password: CUENTA_PASSWORD_POLICY,
      avatar: CUENTA_AVATAR_POLICY,
    },
    architecture: {
      singleHttpClient: true,
      noStorage: true,
      noLocalStore: true,
      noRawFetch: true,
      noEndpointDiscovery: true,
      selfOnly: true,
      adminUserUpdateUsed: false,
      unsupportedUpdatesFailBeforeNetwork: true,
      rawBackendResponseExposed: false,
      azureAvatarSasRuntimeOnly: true,
      sessionIdExposed: false,
    },
  };
}

export const getSnapshot = getCuentaApiSnapshot;
export const snapshot = getCuentaApiSnapshot;

export const CuentaApi = Object.freeze({
  version: CUENTA_API_VERSION,
  resource: CUENTA_RESOURCE,
  endpoints: CUENTA_ENDPOINTS,
  endpoint: CUENTA_ENDPOINT,
  altEndpoint: CUENTA_ALT_ENDPOINT,
  timeout: CUENTA_TIMEOUT,
  detailTimeout: CUENTA_DETAIL_TIMEOUT,
  uploadTimeout: CUENTA_UPLOAD_TIMEOUT,
  passwordPolicy: CUENTA_PASSWORD_POLICY,
  avatarPolicy: CUENTA_AVATAR_POLICY,
  selfUpdateSupported: CUENTA_SELF_UPDATE_SUPPORTED,

  normalizeCuentaDetail,
  normalizeCuentaSessionsResponse,
  validateCuentaPasswordPayload,
  validateCuentaAvatarFile,
  assertCuentaSelfUpdateSupported,

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
  getCuentaDeactivateEndpoint,

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
  deactivateCuentaRequest,

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
  deactivateCuenta,

  getCuentaApiSnapshot,
  getSnapshot,
  snapshot,
});

export default CuentaApi;

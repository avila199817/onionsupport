/* =========================================================
   Onion SPA - Cuenta Model
   Archivo: src/views/cuenta/cuenta.model.js

   EXTREME PRO SYSTEM · MODEL LAYER · FULL PATCH 12/10
   ACCOUNT SETTINGS · PROFILE PRESERVER · AVATAR READY
   SINGLE RESOURCE MODE · STORE/API/TEMPLATE COMPATIBLE

   RESPONSABILIDADES:
   - normalizar payloads heterogéneos backend/store/cache
   - exponer modelo consistente Cuenta/Preferencias
   - preservar identidad visible: name/email/username/phone/avatar
   - preservar preferencias: darkMode/privacyMode/theme/lang
   - separar estado real de usuario de estado de configuración
   - labels de theme / privacy / idioma / rol / estado
   - flags computados
   - fechas base + timestamps
   - collection helpers
   - sorting helpers
   - stats helpers
   - defensive parsing enterprise ready

   NOTA CRÍTICA:
   - status = estado real del usuario: active/pending/inactive/blocked...
   - accountStatus = estado de configuración: standard/privacy/hardened
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const DEFAULT_PAGE_SIZE = 1;

export const DEFAULT_LANG = "es";
export const DEFAULT_THEME = "light";
export const DEFAULT_ROLE = "user";
export const DEFAULT_USER_STATUS = "active";

export const THEME = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
});

export const PRIVACY = Object.freeze({
  ACTIVE: "active",
  INACTIVE: "inactive",
});

export const ACCOUNT_STATUS = Object.freeze({
  STANDARD: "standard",
  PRIVACY: "privacy",
  HARDENED: "hardened",
});

export const USER_STATUS = Object.freeze({
  ACTIVE: "active",
  PENDING: "pending",
  INACTIVE: "inactive",
  BLOCKED: "blocked",
  SUSPENDED: "suspended",
  DELETED: "deleted",
});

export const ROLE = Object.freeze({
  ADMIN: "admin",
  SUPPORT: "support",
  TECHNICIAN: "technician",
  CLIENT: "client",
  USER: "user",
});

/* =========================================================
   SAFE CORE
========================================================= */

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

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

function safeObject(value, fallback = {}) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : fallback;
}

function hasOwnKeys(value = {}) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length
  );
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

function uniqueStrings(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => safeText(value, ""))
        .filter(Boolean)
    ),
  ];
}

/* =========================================================
   NORMALIZE TEXT
========================================================= */

export function normalizeText(value = "") {
  return safeText(value, "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^\w]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeBoolean(value = undefined, fallback = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value !== 0;
  }

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
      "private",
      "privacy",
      "privado",
      "privacidad",
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
      "public",
      "publico",
      "público",
    ].includes(key)
  ) {
    return false;
  }

  return Boolean(fallback);
}

/* =========================================================
   LABEL MAPS
========================================================= */

export function normalizeTheme(value = null, fallback = DEFAULT_THEME) {
  if (typeof value === "boolean") {
    return value ? THEME.DARK : THEME.LIGHT;
  }

  const key = normalizeKey(value);

  if (
    [
      "dark",
      "darkmode",
      "dark_mode",
      "oscuro",
      "modo_oscuro",
      "night",
      "theme_dark",
    ].includes(key)
  ) {
    return THEME.DARK;
  }

  if (
    [
      "light",
      "lightmode",
      "light_mode",
      "claro",
      "modo_claro",
      "day",
      "theme_light",
    ].includes(key)
  ) {
    return THEME.LIGHT;
  }

  return fallback === THEME.DARK ? THEME.DARK : THEME.LIGHT;
}

export function normalizePrivacy(value = null) {
  if (typeof value === "boolean") {
    return value ? PRIVACY.ACTIVE : PRIVACY.INACTIVE;
  }

  const key = normalizeKey(value);

  if (
    [
      "true",
      "1",
      "active",
      "enabled",
      "on",
      "privacy",
      "private",
      "privado",
      "privacidad",
      "activo",
      "activa",
      "habilitado",
      "habilitada",
    ].includes(key)
  ) {
    return PRIVACY.ACTIVE;
  }

  if (
    [
      "false",
      "0",
      "inactive",
      "disabled",
      "off",
      "public",
      "publico",
      "público",
      "inactivo",
      "inactiva",
      "deshabilitado",
      "deshabilitada",
    ].includes(key)
  ) {
    return PRIVACY.INACTIVE;
  }

  return PRIVACY.INACTIVE;
}

export function normalizeAccountStatus(value = null, context = {}) {
  const key = normalizeKey(value);

  if (
    [
      "standard",
      "default",
      "normal",
      "estandar",
      "estándar",
      "configuracion_estandar",
      "configuración_estándar",
    ].includes(key)
  ) {
    return ACCOUNT_STATUS.STANDARD;
  }

  if (
    [
      "privacy",
      "private",
      "privado",
      "privacidad",
      "privacy_active",
      "privacidad_activa",
    ].includes(key)
  ) {
    return ACCOUNT_STATUS.PRIVACY;
  }

  if (
    [
      "hardened",
      "secure",
      "protected",
      "fortified",
      "reforzado",
      "seguro",
      "proteccion_reforzada",
      "protección_reforzada",
    ].includes(key)
  ) {
    return ACCOUNT_STATUS.HARDENED;
  }

  const detail = safeObject(context);

  const darkMode = normalizeBoolean(detail.darkMode, false);
  const privacyMode = normalizeBoolean(detail.privacyMode, false);

  if (darkMode && privacyMode) {
    return ACCOUNT_STATUS.HARDENED;
  }

  if (privacyMode) {
    return ACCOUNT_STATUS.PRIVACY;
  }

  return ACCOUNT_STATUS.STANDARD;
}

export function normalizeUserStatus(value = DEFAULT_USER_STATUS) {
  const key = normalizeKey(value);

  if (["active", "activo", "activa", "enabled", "alta"].includes(key)) {
    return USER_STATUS.ACTIVE;
  }

  if (["pending", "pendiente", "new", "nuevo", "nueva"].includes(key)) {
    return USER_STATUS.PENDING;
  }

  if (
    [
      "inactive",
      "inactivo",
      "inactiva",
      "disabled",
      "deshabilitado",
      "deshabilitada",
    ].includes(key)
  ) {
    return USER_STATUS.INACTIVE;
  }

  if (
    [
      "blocked",
      "bloqueado",
      "bloqueada",
      "locked",
      "lock",
    ].includes(key)
  ) {
    return USER_STATUS.BLOCKED;
  }

  if (["suspended", "suspendido", "suspendida"].includes(key)) {
    return USER_STATUS.SUSPENDED;
  }

  if (
    [
      "deleted",
      "eliminado",
      "eliminada",
      "removed",
      "borrado",
      "borrada",
    ].includes(key)
  ) {
    return USER_STATUS.DELETED;
  }

  return USER_STATUS.ACTIVE;
}

export function normalizeRole(value = DEFAULT_ROLE) {
  const obj = safeObject(value, null);

  const raw = obj
    ? first(obj.name, obj.nombre, obj.code, obj.id, DEFAULT_ROLE)
    : value;

  const key = normalizeKey(raw);

  if (
    [
      "admin",
      "administrator",
      "superadmin",
      "super_admin",
      "root",
      "owner",
    ].includes(key)
  ) {
    return ROLE.ADMIN;
  }

  if (["support", "soporte"].includes(key)) {
    return ROLE.SUPPORT;
  }

  if (["technician", "tecnico", "técnico"].includes(key)) {
    return ROLE.TECHNICIAN;
  }

  if (["client", "cliente", "customer"].includes(key)) {
    return ROLE.CLIENT;
  }

  return ROLE.USER;
}

export function normalizeLang(value = DEFAULT_LANG) {
  const key = normalizeKey(value);

  if (["en", "eng", "english", "en_us", "en_gb"].includes(key)) {
    return "en";
  }

  if (
    [
      "ca",
      "cat",
      "catala",
      "catalan",
      "ca_es",
      "catalunya",
    ].includes(key)
  ) {
    return "ca";
  }

  return "es";
}

/* =========================================================
   LABELS
========================================================= */

export function getThemeLabel(value = null) {
  return normalizeTheme(value) === THEME.DARK
    ? "Dark mode"
    : "Light mode";
}

export function getPrivacyLabel(value = null) {
  return normalizePrivacy(value) === PRIVACY.ACTIVE
    ? "Privacidad activa"
    : "Privacidad desactivada";
}

export function getAccountStatusLabel(value = null, context = {}) {
  const status = normalizeAccountStatus(value, context);

  if (status === ACCOUNT_STATUS.HARDENED) {
    return "Protección reforzada";
  }

  if (status === ACCOUNT_STATUS.PRIVACY) {
    return "Privacidad activa";
  }

  return "Configuración estándar";
}

export function getUserStatusLabel(value = DEFAULT_USER_STATUS) {
  const status = normalizeUserStatus(value);

  if (status === USER_STATUS.ACTIVE) return "Activa";
  if (status === USER_STATUS.PENDING) return "Pendiente";
  if (status === USER_STATUS.INACTIVE) return "Inactiva";
  if (status === USER_STATUS.BLOCKED) return "Bloqueada";
  if (status === USER_STATUS.SUSPENDED) return "Suspendida";
  if (status === USER_STATUS.DELETED) return "Eliminada";

  return "Activa";
}

export function getUserStatusTone(value = DEFAULT_USER_STATUS) {
  const status = normalizeUserStatus(value);

  if (status === USER_STATUS.ACTIVE) return "success";
  if (status === USER_STATUS.PENDING) return "warning";

  if (
    status === USER_STATUS.INACTIVE ||
    status === USER_STATUS.BLOCKED ||
    status === USER_STATUS.SUSPENDED ||
    status === USER_STATUS.DELETED
  ) {
    return "danger";
  }

  return "default";
}

export function getRoleLabel(value = DEFAULT_ROLE) {
  const role = normalizeRole(value);

  if (role === ROLE.ADMIN) return "Administrador";
  if (role === ROLE.SUPPORT) return "Soporte";
  if (role === ROLE.TECHNICIAN) return "Técnico";
  if (role === ROLE.CLIENT) return "Cliente";

  return "Usuario";
}

export function getLangLabel(value = DEFAULT_LANG) {
  const lang = normalizeLang(value);

  if (lang === "ca") return "Català";
  if (lang === "en") return "English";

  return "Español";
}

/* =========================================================
   DATES
========================================================= */

export function toDate(value = null) {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 9999999999 ? value : value * 1000;
    const date = new Date(ms);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  const raw = safeText(value, "");
  if (!raw) return null;

  const date = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function toTimestamp(value = null) {
  const date = toDate(value);
  return date ? date.getTime() : 0;
}

export function normalizeDateValue(value = null) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

/* =========================================================
   SOURCE COLLECTOR
========================================================= */

function pickNestedObject(payload = null, keys = []) {
  const obj = safeObject(payload);

  for (const key of safeArray(keys)) {
    const value = obj?.[key];

    if (hasOwnKeys(value)) {
      return value;
    }
  }

  return {};
}

export function collectCuentaSource(payload = null, fallback = {}) {
  const root = safeObject(payload);
  const baseFallback = safeObject(fallback);

  const data = safeObject(root.data);
  const item = safeObject(root.item);
  const cuenta = safeObject(root.cuenta);
  const account = safeObject(root.account);
  const user = safeObject(root.user);
  const profile = safeObject(root.profile);
  const preferencesRoot = safeObject(root.preferences);
  const settingsRoot = safeObject(root.settings);
  const result = safeObject(root.result);
  const payloadObj = safeObject(root.payload);

  const dataItem = safeObject(data.item);
  const dataCuenta = safeObject(data.cuenta);
  const dataAccount = safeObject(data.account);
  const dataUser = safeObject(data.user);
  const dataProfile = safeObject(data.profile);

  const payloadItem = safeObject(payloadObj.item);
  const payloadCuenta = safeObject(payloadObj.cuenta);
  const payloadAccount = safeObject(payloadObj.account);
  const payloadUser = safeObject(payloadObj.user);
  const payloadProfile = safeObject(payloadObj.profile);

  const resultItem = safeObject(result.item);
  const resultCuenta = safeObject(result.cuenta);
  const resultAccount = safeObject(result.account);
  const resultUser = safeObject(result.user);
  const resultProfile = safeObject(result.profile);

  const preferences = {
    ...safeObject(baseFallback.preferences),
    ...safeObject(data.preferences),
    ...safeObject(item.preferences),
    ...safeObject(cuenta.preferences),
    ...safeObject(account.preferences),
    ...safeObject(user.preferences),
    ...safeObject(profile.preferences),
    ...safeObject(payloadObj.preferences),
    ...safeObject(result.preferences),
    ...safeObject(dataUser.preferences),
    ...safeObject(dataAccount.preferences),
    ...safeObject(payloadUser.preferences),
    ...safeObject(payloadAccount.preferences),
    ...preferencesRoot,
  };

  const settings = {
    ...safeObject(baseFallback.settings),
    ...safeObject(data.settings),
    ...safeObject(item.settings),
    ...safeObject(cuenta.settings),
    ...safeObject(account.settings),
    ...safeObject(user.settings),
    ...safeObject(profile.settings),
    ...safeObject(payloadObj.settings),
    ...safeObject(result.settings),
    ...settingsRoot,
  };

  const primary = {
    ...baseFallback,
    ...safeObject(data),
    ...safeObject(payloadObj),
    ...safeObject(result),

    ...dataItem,
    ...dataCuenta,
    ...dataAccount,
    ...dataUser,
    ...dataProfile,

    ...payloadItem,
    ...payloadCuenta,
    ...payloadAccount,
    ...payloadUser,
    ...payloadProfile,

    ...resultItem,
    ...resultCuenta,
    ...resultAccount,
    ...resultUser,
    ...resultProfile,

    ...item,
    ...cuenta,
    ...account,
    ...user,
    ...profile,

    ...root,
  };

  return {
    ...primary,
    ...preferences,
    ...settings,

    user: {
      ...safeObject(baseFallback.user),
      ...safeObject(primary.user),
      ...user,
      ...dataUser,
      ...payloadUser,
      ...resultUser,
    },

    account: {
      ...safeObject(baseFallback.account),
      ...safeObject(primary.account),
      ...account,
      ...dataAccount,
      ...payloadAccount,
      ...resultAccount,
    },

    profile: {
      ...safeObject(baseFallback.profile),
      ...safeObject(primary.profile),
      ...profile,
      ...dataProfile,
      ...payloadProfile,
      ...resultProfile,
    },

    preferences,
    settings,

    raw: payload,
  };
}

/* =========================================================
   IDENTITY RESOLVERS
========================================================= */

function resolveUserId(source = {}, fallback = {}) {
  return safeText(
    first(
      source.userId,
      source.uid,
      source.sub,
      source.user_id,

      source.user?.userId,
      source.user?.id,
      source.user?.uid,
      source.user?.sub,

      source.account?.userId,
      source.account?.id,

      source.profile?.userId,
      source.profile?.id,

      source.preferences?.userId,
      source.settings?.userId,

      fallback.userId,
      fallback.uid,
      fallback.sub,
      fallback.id
    ),
    ""
  );
}

function resolveId(source = {}, userId = "", fallback = {}) {
  return safeText(
    first(
      source.id,
      source._id,
      source.resourceId,
      source.accountId,
      source.profileId,
      userId,
      fallback.id,
      fallback._id,
      fallback.resourceId,
      "cuenta"
    ),
    "cuenta"
  );
}

function resolveEmail(source = {}, fallback = {}) {
  return safeLower(
    first(
      source.email,
      source.emailLower,
      source.mail,
      source.userEmail,

      source.user?.email,
      source.user?.emailLower,
      source.user?.mail,

      source.account?.email,
      source.account?.emailLower,

      source.profile?.email,
      source.profile?.emailLower,

      fallback.email,
      fallback.emailLower,
      fallback.mail
    ),
    ""
  );
}

function resolveUsername(source = {}, fallback = {}) {
  return safeText(
    first(
      source.username,
      source.usernameLower,
      source.userName,
      source.nick,
      source.alias,
      source.handle,
      source.slug,

      source.user?.username,
      source.user?.usernameLower,
      source.user?.userName,
      source.user?.handle,
      source.user?.slug,

      source.account?.username,
      source.account?.usernameLower,

      source.profile?.username,
      source.profile?.usernameLower,

      fallback.username,
      fallback.usernameLower,
      fallback.userName,
      fallback.handle,
      fallback.slug
    ),
    ""
  );
}

function resolveDisplayName(source = {}, fallback = {}, username = "", email = "") {
  return safeText(
    first(
      source.name,
      source.nombre,
      source.fullName,
      source.full_name,
      source.displayName,
      source.display_name,

      source.user?.name,
      source.user?.nombre,
      source.user?.fullName,
      source.user?.displayName,

      source.account?.name,
      source.account?.nombre,
      source.account?.fullName,
      source.account?.displayName,

      source.profile?.name,
      source.profile?.nombre,
      source.profile?.fullName,
      source.profile?.displayName,

      fallback.name,
      fallback.nombre,
      fallback.fullName,
      fallback.displayName,

      username,
      email,
      "Usuario Onion"
    ),
    "Usuario Onion"
  );
}

function resolvePhone(source = {}, fallback = {}) {
  return safeText(
    first(
      source.phone,
      source.telefono,
      source.mobile,
      source.tel,

      source.user?.phone,
      source.user?.telefono,
      source.user?.mobile,

      source.account?.phone,
      source.account?.telefono,
      source.account?.mobile,

      source.profile?.phone,
      source.profile?.telefono,
      source.profile?.mobile,

      fallback.phone,
      fallback.telefono,
      fallback.mobile
    ),
    ""
  );
}

function resolveAvatarUrl(source = {}, fallback = {}) {
  return safeText(
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
      source.imageURL,
      source.image_url,
      source.image,
      source.picture,
      source.pictureUrl,
      source.pictureURL,
      source.profilePicture,
      source.profilePictureUrl,

      source.user?.avatarUrl,
      source.user?.avatar,
      source.user?.photoUrl,
      source.user?.photoURL,
      source.user?.imageUrl,
      source.user?.image,
      source.user?.picture,
      source.user?.pictureUrl,

      source.account?.avatarUrl,
      source.account?.avatar,
      source.account?.photoUrl,
      source.account?.imageUrl,
      source.account?.picture,

      source.profile?.avatarUrl,
      source.profile?.avatar,
      source.profile?.photoUrl,
      source.profile?.photoURL,
      source.profile?.imageUrl,
      source.profile?.image,
      source.profile?.picture,
      source.profile?.pictureUrl,

      fallback.avatarUrl,
      fallback.avatar,
      fallback.photoUrl,
      fallback.photoURL,
      fallback.imageUrl,
      fallback.image,
      fallback.picture,
      fallback.pictureUrl
    ),
    ""
  );
}

function resolveClienteId(source = {}, fallback = {}) {
  return safeText(
    first(
      source.clienteId,
      source.clientId,
      source.customerId,

      source.cliente?.clienteId,
      source.cliente?.id,
      source.client?.clientId,
      source.client?.id,
      source.customer?.customerId,
      source.customer?.id,

      source.user?.clienteId,
      source.account?.clienteId,
      source.profile?.clienteId,

      fallback.clienteId,
      fallback.clientId,
      fallback.customerId
    ),
    ""
  );
}

/* =========================================================
   CORE NORMALIZER
========================================================= */

export function normalizeCuentaModel(payload = {}, fallback = {}) {
  const fallbackObj = safeObject(fallback);
  const source = collectCuentaSource(payload, fallbackObj);

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
    fallbackObj.mode,
    fallbackObj.appearance,
    DEFAULT_THEME
  );

  const darkMode = normalizeBoolean(
    first(
      source.darkMode,
      source.isDark,

      source.preferences?.darkMode,
      source.preferences?.isDark,

      source.settings?.darkMode,
      source.settings?.isDark,

      rawTheme === THEME.DARK ? true : null,
      rawTheme === THEME.LIGHT ? false : null,

      fallbackObj.darkMode,
      fallbackObj.preferences?.darkMode,
      DEFAULT_THEME === THEME.DARK
    ),
    DEFAULT_THEME === THEME.DARK
  );

  const theme = normalizeTheme(
    first(rawTheme, darkMode ? THEME.DARK : THEME.LIGHT),
    darkMode ? THEME.DARK : THEME.LIGHT
  );

  const privacyMode = normalizeBoolean(
    first(
      source.privacyMode,
      source.privateMode,
      source.isPrivate,
      source.privacy,

      source.preferences?.privacyMode,
      source.preferences?.privateMode,
      source.preferences?.privacy,

      source.settings?.privacyMode,
      source.settings?.privateMode,
      source.settings?.privacy,

      fallbackObj.privacyMode,
      fallbackObj.preferences?.privacyMode,
      false
    ),
    false
  );

  const privacy = normalizePrivacy(privacyMode);

  const lang = normalizeLang(
    first(
      source.lang,
      source.language,
      source.locale,
      source.idioma,

      source.preferences?.lang,
      source.preferences?.language,
      source.preferences?.locale,

      source.settings?.lang,
      source.settings?.language,
      source.settings?.locale,

      fallbackObj.lang,
      fallbackObj.language,
      fallbackObj.locale,
      DEFAULT_LANG
    )
  );

  const userId = resolveUserId(source, fallbackObj);
  const id = resolveId(source, userId, fallbackObj);
  const resourceId = safeText(
    first(source.resourceId, userId, id, fallbackObj.resourceId, "cuenta"),
    "cuenta"
  );

  const email = resolveEmail(source, fallbackObj);
  const username = resolveUsername(source, fallbackObj);
  const name = resolveDisplayName(source, fallbackObj, username, email);
  const phone = resolvePhone(source, fallbackObj);
  const avatarUrl = resolveAvatarUrl(source, fallbackObj);
  const clienteId = resolveClienteId(source, fallbackObj);

  const role = normalizeRole(
    first(
      source.role,
      source.rol,
      source.accountRole,
      source.profileRole,

      source.user?.role,
      source.user?.rol,

      source.account?.role,
      source.account?.rol,

      source.profile?.role,
      source.profile?.rol,

      fallbackObj.role,
      fallbackObj.rol,
      DEFAULT_ROLE
    )
  );

  const userStatus = normalizeUserStatus(
    first(
      source.status,
      source.estado,
      source.userStatus,
      source.accountState,

      source.user?.status,
      source.user?.estado,

      source.account?.status,
      source.account?.estado,

      source.profile?.status,
      source.profile?.estado,

      fallbackObj.status,
      fallbackObj.estado,
      DEFAULT_USER_STATUS
    )
  );

  const accountStatus = normalizeAccountStatus(
    first(
      source.accountStatus,
      source.securityStatus,
      source.configurationStatus,
      source.preferences?.accountStatus,
      source.settings?.accountStatus,
      fallbackObj.accountStatus,
      fallbackObj.securityStatus,
      null
    ),
    {
      darkMode,
      privacyMode,
    }
  );

  const active = normalizeBoolean(
    first(
      source.active,
      source.enabled,
      source.isActive,
      userStatus === USER_STATUS.ACTIVE ? true : null,
      fallbackObj.active,
      true
    ),
    true
  );

  const createdAt = first(
    source.createdAt,
    source.created_at,
    source.created,
    source.registeredAt,

    source.user?.createdAt,
    source.account?.createdAt,
    source.profile?.createdAt,

    fallbackObj.createdAt,
    fallbackObj.created_at,
    null
  );

  const updatedAt = first(
    source.updatedAt,
    source.updated_at,
    source.modifiedAt,
    source.lastUpdatedAt,
    source.lastUpdate,

    source.preferences?.updatedAt,
    source.preferences?.updated_at,

    source.settings?.updatedAt,
    source.settings?.updated_at,

    source.user?.updatedAt,
    source.account?.updatedAt,
    source.profile?.updatedAt,

    fallbackObj.updatedAt,
    fallbackObj.updated_at,
    fallbackObj.preferences?.updatedAt,
    null
  );

  const lastLoginAt = first(
    source.lastLoginAt,
    source.lastLogin,
    source.ultimoLogin,
    source.lastSeenAt,
    source.lastAccessAt,

    source.session?.lastLoginAt,
    source.user?.lastLoginAt,
    source.account?.lastLoginAt,

    fallbackObj.lastLoginAt,
    fallbackObj.lastSeenAt,
    null
  );

  const createdAtTs = toTimestamp(createdAt);
  const updatedAtTs = toTimestamp(updatedAt);
  const lastLoginAtTs = toTimestamp(lastLoginAt);

  const themeLabel = getThemeLabel(theme);
  const privacyLabel = getPrivacyLabel(privacy);
  const accountStatusLabel = getAccountStatusLabel(accountStatus, {
    darkMode,
    privacyMode,
  });
  const statusLabel = getUserStatusLabel(userStatus);
  const statusTone = getUserStatusTone(userStatus);
  const roleLabel = getRoleLabel(role);
  const langLabel = getLangLabel(lang);

  const isDarkMode = theme === THEME.DARK;
  const isLightMode = theme === THEME.LIGHT;
  const isPrivacyMode = privacy === PRIVACY.ACTIVE;
  const isPrivacyOff = privacy === PRIVACY.INACTIVE;
  const isHardened = accountStatus === ACCOUNT_STATUS.HARDENED;
  const isStandard = accountStatus === ACCOUNT_STATUS.STANDARD;
  const isPrivacyFocused = accountStatus === ACCOUNT_STATUS.PRIVACY;

  const initials = getInitials(name || username || email);

  const preferences = {
    ...safeObject(source.preferences),

    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,

    lang,
    language: lang,
    locale: lang,

    accountStatus,
    status: accountStatus,
    accountStatusLabel,

    updatedAt,
    updated_at: updatedAt,
  };

  const settings = {
    ...safeObject(source.settings),
    ...preferences,
  };

  const profile = {
    ...safeObject(source.profile),

    id,
    userId,

    name,
    nombre: safeText(first(source.profile?.nombre, name), name),
    fullName: safeText(first(source.profile?.fullName, name), name),
    displayName: safeText(first(source.profile?.displayName, name), name),

    email,
    emailLower: email,

    username,
    usernameLower: safeLower(username, ""),

    phone,
    telefono: phone,
    mobile: phone,

    avatar: avatarUrl,
    avatarUrl,
    avatarURL: avatarUrl,
    avatar_url: avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,

    initials,
  };

  const user = {
    ...safeObject(source.user),

    id,
    userId,
    uid: userId,
    sub: userId,

    email,
    emailLower: email,

    username,
    usernameLower: safeLower(username, ""),

    name,
    nombre: name,
    fullName: name,
    displayName: name,

    phone,
    telefono: phone,
    mobile: phone,

    avatar: avatarUrl,
    avatarUrl,
    photoUrl: avatarUrl,
    picture: avatarUrl,

    role,
    rol: role,
    roleLabel,

    status: userStatus,
    estado: userStatus,
    statusLabel,
    statusTone,

    active,

    clienteId,

    ...preferences,
  };

  const account = {
    ...safeObject(source.account),

    id,
    resourceId,
    userId,

    email,
    username,
    name,
    displayName: name,

    phone,
    avatarUrl,

    role,
    roleLabel,

    status: userStatus,
    estado: userStatus,
    statusLabel,
    statusTone,

    accountStatus,
    accountStatusLabel,

    clienteId,

    ...preferences,
  };

  return {
    ...source,

    /* identity */
    id,
    _id: safeText(first(source._id, id), id),
    resourceId,

    userId,
    uid: safeText(first(source.uid, userId), userId),
    sub: safeText(first(source.sub, userId), userId),

    accountId: safeText(first(source.accountId, source.account?.id, id), id),
    profileId: safeText(first(source.profileId, source.profile?.id, id), id),

    clienteId,
    clientId: safeText(first(source.clientId, clienteId), clienteId),
    customerId: safeText(first(source.customerId, clienteId), clienteId),

    /* visible profile */
    name,
    nombre: safeText(first(source.nombre, name), name),
    fullName: safeText(first(source.fullName, name), name),
    full_name: safeText(first(source.full_name, name), name),
    displayName: safeText(first(source.displayName, name), name),
    display_name: safeText(first(source.display_name, name), name),

    email,
    emailLower: safeLower(first(source.emailLower, email), email),
    mail: safeText(first(source.mail, email), email),

    username,
    usernameLower: safeLower(first(source.usernameLower, username), username),
    userName: safeText(first(source.userName, username), username),
    handle: safeText(first(source.handle, username), username),

    phone,
    telefono: safeText(first(source.telefono, phone), phone),
    mobile: safeText(first(source.mobile, phone), phone),

    avatar: avatarUrl,
    avatarUrl,
    avatarURL: avatarUrl,
    avatar_url: avatarUrl,
    photoUrl: avatarUrl,
    photoURL: avatarUrl,
    photo_url: avatarUrl,
    image: avatarUrl,
    imageUrl: avatarUrl,
    image_url: avatarUrl,
    picture: avatarUrl,
    pictureUrl: avatarUrl,
    profilePicture: avatarUrl,
    profilePictureUrl: avatarUrl,

    initials,

    /* role */
    role,
    rol: role,
    roleLabel,

    /* real user status */
    status: userStatus,
    estado: userStatus,
    userStatus,
    statusLabel,
    statusTone,
    active,

    /* account configuration status */
    accountStatus,
    securityStatus: accountStatus,
    configurationStatus: accountStatus,
    accountStatusLabel,

    /* preferences */
    darkMode,
    privacyMode,

    theme,
    mode: theme,
    appearance: theme,
    colorMode: theme,

    privacy,

    lang,
    language: lang,
    locale: lang,
    idioma: lang,
    langLabel,

    /* labels */
    themeLabel,
    privacyLabel,

    /* dates */
    createdAt,
    created_at: createdAt,
    createdAtTs,

    updatedAt,
    updated_at: updatedAt,
    updatedAtTs,

    lastLoginAt,
    lastLoginAtTs,

    /* flags */
    isDarkMode,
    isLightMode,
    isPrivacyMode,
    isPrivacyOff,
    isHardened,
    isStandard,
    isPrivacyFocused,

    hasAvatar: Boolean(avatarUrl),
    hasEmail: Boolean(email),
    hasUsername: Boolean(username),
    hasPhone: Boolean(phone),
    hasCliente: Boolean(clienteId),

    /* misc */
    endpoint: safeText(
      first(
        source.endpoint,
        source.api,
        fallbackObj.endpoint,
        "/api/user/preferences"
      ),
      "/api/user/preferences"
    ),

    nif: safeText(first(source.nif, source.taxId, source.cif, fallbackObj.nif), ""),

    preferences,
    settings,
    profile,
    user,
    account,

    meta: {
      ...safeObject(source.meta),
      source: "cuenta.model",
      normalizedAt: new Date().toISOString(),
      hasAvatar: Boolean(avatarUrl),
      hasProfile: hasOwnKeys(profile),
      hasPreferences: hasOwnKeys(preferences),
      status: userStatus,
      accountStatus,
      theme,
      lang,
    },

    /* raw */
    raw: payload,
  };
}

/* =========================================================
   AVATAR / INITIALS
========================================================= */

export function getInitials(value = "") {
  const text = safeText(value, "");

  if (!text) return "ON";

  const parts = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) return "ON";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase() || "ON";
}

export function getCuentaDisplayName(item = {}) {
  const detail = normalizeCuentaModel(item);

  return safeText(
    first(
      detail.displayName,
      detail.name,
      detail.fullName,
      detail.username,
      detail.email
    ),
    "Usuario Onion"
  );
}

export function getCuentaAvatarUrl(item = {}) {
  return safeText(normalizeCuentaModel(item).avatarUrl, "");
}

export function getCuentaEmail(item = {}) {
  return safeText(normalizeCuentaModel(item).email, "");
}

export function getCuentaUsername(item = {}) {
  return safeText(normalizeCuentaModel(item).username, "");
}

export function getCuentaUserId(item = {}) {
  const detail = normalizeCuentaModel(item);

  return safeText(first(detail.userId, detail.id, detail.resourceId), "");
}

/* =========================================================
   PAYLOAD UNWRAP
========================================================= */

export function unwrapCuentaPayload(payload = null) {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload;
  }

  const obj = safeObject(payload);

  if (!Object.keys(obj).length) {
    return [];
  }

  if (Array.isArray(obj.items)) return obj.items;
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.list)) return obj.list;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.payload)) return obj.payload;

  if (obj.item) return [obj.item];
  if (obj.cuenta) return [obj.cuenta];
  if (obj.account) return [obj.account];
  if (obj.user) return [obj.user];
  if (obj.profile) return [obj.profile];
  if (obj.detail) return [obj.detail];
  if (obj.result) return [obj.result];

  if (obj.payload && typeof obj.payload === "object") {
    const nested = unwrapCuentaPayload(obj.payload);
    if (nested.length) return nested;
  }

  if (obj.data && typeof obj.data === "object") {
    const nested = unwrapCuentaPayload(obj.data);
    if (nested.length) return nested;
  }

  if (obj.preferences || obj.settings || obj.darkMode !== undefined || obj.privacyMode !== undefined) {
    return [obj];
  }

  if (Object.keys(obj).length) {
    return [obj];
  }

  return [];
}

export function normalizeCuentaCollection(payload = [], fallback = {}) {
  return dedupeCuentaCollection(
    unwrapCuentaPayload(payload).map((item) =>
      normalizeCuentaModel(item, fallback)
    )
  );
}

/* =========================================================
   COLLECTION HELPERS
========================================================= */

export function getCuentaModelId(item = {}) {
  const detail = normalizeCuentaModel(item);

  return safeText(
    first(
      detail.userId,
      detail.resourceId,
      detail.accountId,
      detail.profileId,
      detail.id,
      detail.email,
      detail.username,
      "cuenta"
    ),
    "cuenta"
  );
}

export function dedupeCuentaCollection(items = []) {
  const map = new Map();
  const anonymous = [];

  safeArray(items).forEach((rawItem) => {
    const item = normalizeCuentaModel(rawItem);
    const id = getCuentaModelId(item);

    if (!id) {
      anonymous.push(item);
      return;
    }

    if (!map.has(id)) {
      map.set(id, item);
      return;
    }

    const current = map.get(id);
    map.set(
      id,
      normalizeCuentaModel({
        ...current,
        ...item,
        preferences: {
          ...safeObject(current.preferences),
          ...safeObject(item.preferences),
        },
        profile: {
          ...safeObject(current.profile),
          ...safeObject(item.profile),
        },
        raw: item.raw || current.raw,
      })
    );
  });

  return [...map.values(), ...anonymous];
}

export function mergeCuentaModel(base = {}, patch = {}) {
  const current = normalizeCuentaModel(base);
  const incoming = safeObject(patch);

  return normalizeCuentaModel({
    ...current,
    ...incoming,
    preferences: {
      ...safeObject(current.preferences),
      ...safeObject(incoming.preferences),
    },
    settings: {
      ...safeObject(current.settings),
      ...safeObject(incoming.settings),
    },
    profile: {
      ...safeObject(current.profile),
      ...safeObject(incoming.profile),
    },
    user: {
      ...safeObject(current.user),
      ...safeObject(incoming.user),
    },
    account: {
      ...safeObject(current.account),
      ...safeObject(incoming.account),
    },
  });
}

/* =========================================================
   SORT
========================================================= */

export function sortCuentaByUpdatedDesc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aModel = normalizeCuentaModel(a);
    const bModel = normalizeCuentaModel(b);

    return safeNumber(bModel.updatedAtTs, 0) - safeNumber(aModel.updatedAtTs, 0);
  });
}

export function sortCuentaBySecurityDesc(items = []) {
  const weight = {
    [ACCOUNT_STATUS.HARDENED]: 3,
    [ACCOUNT_STATUS.PRIVACY]: 2,
    [ACCOUNT_STATUS.STANDARD]: 1,
  };

  return [...safeArray(items)].sort((a, b) => {
    const aModel = normalizeCuentaModel(a);
    const bModel = normalizeCuentaModel(b);

    return (
      safeNumber(weight[bModel.accountStatus], 0) -
      safeNumber(weight[aModel.accountStatus], 0)
    );
  });
}

export function sortCuentaByNameAsc(items = []) {
  return [...safeArray(items)].sort((a, b) => {
    const aModel = normalizeCuentaModel(a);
    const bModel = normalizeCuentaModel(b);

    return safeText(aModel.displayName, "").localeCompare(
      safeText(bModel.displayName, ""),
      "es",
      {
        sensitivity: "base",
      }
    );
  });
}

/* =========================================================
   PAGINATION
========================================================= */

export function paginateCuenta(
  items = [],
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
) {
  const list = safeArray(items);

  const size = Math.max(
    1,
    safeNumber(pageSize, DEFAULT_PAGE_SIZE)
  );

  const total = list.length;

  const totalPages = Math.max(
    1,
    Math.ceil(total / size)
  );

  const current = Math.min(
    Math.max(1, safeNumber(page, 1)),
    totalPages
  );

  const start = (current - 1) * size;
  const end = start + size;

  return {
    page: current,
    pageSize: size,
    total,
    totalPages,
    items: list.slice(start, end),
    from: total === 0 ? 0 : start + 1,
    to: Math.min(end, total),
    hasPrev: current > 1,
    hasNext: current < totalPages,
  };
}

/* =========================================================
   STATS
========================================================= */

export function computeCuentaStats(items = []) {
  const list = safeArray(items).map(normalizeCuentaModel);

  return {
    total: list.length,

    darkMode: list.filter((x) => x.isDarkMode).length,
    lightMode: list.filter((x) => x.isLightMode).length,

    privacyOn: list.filter((x) => x.isPrivacyMode).length,
    privacyOff: list.filter((x) => x.isPrivacyOff).length,

    hardened: list.filter((x) => x.isHardened).length,
    privacyFocused: list.filter((x) => x.isPrivacyFocused).length,
    standard: list.filter((x) => x.isStandard).length,

    active: list.filter((x) => x.status === USER_STATUS.ACTIVE).length,
    pending: list.filter((x) => x.status === USER_STATUS.PENDING).length,
    inactive: list.filter((x) => x.status === USER_STATUS.INACTIVE).length,
    blocked: list.filter((x) => x.status === USER_STATUS.BLOCKED).length,

    withAvatar: list.filter((x) => x.hasAvatar).length,
    withEmail: list.filter((x) => x.hasEmail).length,
    withPhone: list.filter((x) => x.hasPhone).length,
  };
}

/* =========================================================
   FINDERS
========================================================= */

export function findCuentaById(items = [], id = "") {
  const target = safeText(id, "");

  if (!target) return null;

  const normalizedTarget = safeLower(target, "");

  return (
    safeArray(items)
      .map(normalizeCuentaModel)
      .find((item) => {
        const candidates = [
          item.id,
          item.resourceId,
          item.userId,
          item.uid,
          item.sub,
          item.accountId,
          item.profileId,
          item.clienteId,
          item.email,
          item.username,
        ]
          .map((value) => safeLower(value, ""))
          .filter(Boolean);

        return candidates.includes(normalizedTarget);
      }) || null
  );
}

export function findCuentaByEmail(items = [], email = "") {
  const target = safeLower(email, "");

  if (!target) return null;

  return (
    safeArray(items)
      .map(normalizeCuentaModel)
      .find((item) => safeLower(item.email, "") === target) || null
  );
}

export function findCuentaByUsername(items = [], username = "") {
  const target = safeLower(username, "");

  if (!target) return null;

  return (
    safeArray(items)
      .map(normalizeCuentaModel)
      .find((item) => safeLower(item.username, "") === target) || null
  );
}

/* =========================================================
   SERIALIZATION
========================================================= */

export function buildCuentaPreferencesPayload(item = {}) {
  const detail = normalizeCuentaModel(item);

  return {
    darkMode: Boolean(detail.darkMode),
    privacyMode: Boolean(detail.privacyMode),
    theme: detail.theme,
    mode: detail.theme,
    appearance: detail.theme,
    lang: detail.lang,
    language: detail.lang,
    locale: detail.lang,
  };
}

export function buildCuentaProfilePayload(item = {}) {
  const detail = normalizeCuentaModel(item);

  return {
    name: detail.name,
    displayName: detail.displayName,
    fullName: detail.fullName,
    nombre: detail.nombre,
    phone: detail.phone,
    telefono: detail.telefono,
    mobile: detail.mobile,
  };
}

export function buildCuentaUpdatePayload(item = {}) {
  return {
    ...buildCuentaProfilePayload(item),
    ...buildCuentaPreferencesPayload(item),
  };
}

export function buildCuentaSnapshot(item = {}) {
  const detail = normalizeCuentaModel(item);

  return {
    id: detail.id,
    resourceId: detail.resourceId,
    userId: detail.userId,

    name: detail.name,
    displayName: detail.displayName,
    email: detail.email,
    username: detail.username,
    phone: detail.phone,
    avatarUrl: detail.avatarUrl,
    initials: detail.initials,

    role: detail.role,
    roleLabel: detail.roleLabel,

    status: detail.status,
    statusLabel: detail.statusLabel,
    statusTone: detail.statusTone,

    accountStatus: detail.accountStatus,
    accountStatusLabel: detail.accountStatusLabel,

    darkMode: detail.darkMode,
    privacyMode: detail.privacyMode,
    theme: detail.theme,
    privacy: detail.privacy,

    lang: detail.lang,
    langLabel: detail.langLabel,

    updatedAt: detail.updatedAt,
    updatedAtTs: detail.updatedAtTs,

    flags: {
      isDarkMode: detail.isDarkMode,
      isLightMode: detail.isLightMode,
      isPrivacyMode: detail.isPrivacyMode,
      isPrivacyOff: detail.isPrivacyOff,
      isHardened: detail.isHardened,
      isStandard: detail.isStandard,
      isPrivacyFocused: detail.isPrivacyFocused,
      hasAvatar: detail.hasAvatar,
      hasEmail: detail.hasEmail,
      hasUsername: detail.hasUsername,
      hasPhone: detail.hasPhone,
    },
  };
}

/* =========================================================
   VALIDATION
========================================================= */

export function validateCuentaModel(item = {}) {
  const detail = normalizeCuentaModel(item);
  const errors = {};

  if (!["dark", "light"].includes(detail.theme)) {
    errors.theme = "Tema no válido.";
  }

  if (!["es", "en", "ca"].includes(detail.lang)) {
    errors.lang = "Idioma no válido.";
  }

  if (!Object.values(USER_STATUS).includes(detail.status)) {
    errors.status = "Estado de usuario no válido.";
  }

  if (!Object.values(ACCOUNT_STATUS).includes(detail.accountStatus)) {
    errors.accountStatus = "Estado de configuración no válido.";
  }

  if (!Object.values(ROLE).includes(detail.role)) {
    errors.role = "Rol no válido.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    item: detail,
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  DEFAULT_PAGE_SIZE,
  DEFAULT_LANG,
  DEFAULT_THEME,
  DEFAULT_ROLE,
  DEFAULT_USER_STATUS,

  THEME,
  PRIVACY,
  ACCOUNT_STATUS,
  USER_STATUS,
  ROLE,

  normalizeText,
  normalizeKey,
  normalizeBoolean,

  normalizeTheme,
  normalizePrivacy,
  normalizeAccountStatus,
  normalizeUserStatus,
  normalizeRole,
  normalizeLang,

  getThemeLabel,
  getPrivacyLabel,
  getAccountStatusLabel,
  getUserStatusLabel,
  getUserStatusTone,
  getRoleLabel,
  getLangLabel,

  toDate,
  toTimestamp,
  normalizeDateValue,

  collectCuentaSource,
  normalizeCuentaModel,

  getInitials,
  getCuentaDisplayName,
  getCuentaAvatarUrl,
  getCuentaEmail,
  getCuentaUsername,
  getCuentaUserId,

  unwrapCuentaPayload,
  normalizeCuentaCollection,
  getCuentaModelId,
  dedupeCuentaCollection,
  mergeCuentaModel,

  sortCuentaByUpdatedDesc,
  sortCuentaBySecurityDesc,
  sortCuentaByNameAsc,

  paginateCuenta,
  computeCuentaStats,

  findCuentaById,
  findCuentaByEmail,
  findCuentaByUsername,

  buildCuentaPreferencesPayload,
  buildCuentaProfilePayload,
  buildCuentaUpdatePayload,
  buildCuentaSnapshot,

  validateCuentaModel,
};

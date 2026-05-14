/* =========================================================
   Onion SPA - Sidebar User
   Archivo: src/ui/sidebar/user.js

   ONION SUPPORT · SIDEBAR USER · AVATAR · EXTREME 10/10
   RESTORE SAFE · LOGOUT SAFE · AVATAR ANTI-RACE · ROLE SAFE

   RESPONSABILIDADES:
   - Resolver usuario actual desde AppCore/Auth-like sources.
   - Obtener display name robusto.
   - Obtener username normalizado.
   - Construir iniciales del avatar preservando acentos Unicode.
   - Resolver URL de avatar.
   - Aplicar color RNG estable por sesión al avatar fallback.
   - Detectar rol admin con aliases/flags/permisos.
   - Renderizar usuario en el footer.
   - Pintar avatar real o fallback.
   - Soportar hasAvatar / avatarUpdatedAt / avatarVersion.
   - Evitar URL vacía/rota/peligrosa.
   - Evitar carreras de carga de avatar.
   - Evitar usuario/avatar fantasma tras logout.
   - Respetar estructura DOM del template.
   - Evitar tooltips nativos en avatar/footer.
   - Emitir snapshot estable del usuario renderizado.

   HARDENING:
   - No depende de una única forma de user.
   - Soporta user/profile/account/meta/claims/raw/customer/cliente.
   - Soporta avatarUrl/photoUrl/picture/profileImage anidados.
   - Bloquea protocolos peligrosos.
   - Bloquea data:image/svg+xml.
   - Bloquea URLs http externas no locales.
   - Cache bust con avatarUpdatedAt/avatarVersion.
   - Fallback inmediato mientras carga imagen real.
   - onload/onerror con token anti-race.
   - Admin por rol, permiso o flags.
   - safeEmit no duplica bus + window.
   - No deja avatar viejo si cambia usuario.
   - Resuelve Auth aunque esté en AppCore.modules o window.
   - Soporta payloads de sesión heterogéneos.
   - Evita false positives de usuario vacío.
   - Redacta tokens/URLs sensibles en eventos, datasets y snapshots.
========================================================= */

import {
  getElements,
  sanitizeFooterTooltipState,
} from "./dom.js";

import {
  SIDEBAR_AVATAR_IMAGE_ID,
  SIDEBAR_AVATAR_FALLBACK_ID,
  SIDEBAR_USER_PLAN_ID,
  SIDEBAR_EVENTS,
  SIDEBAR_ADMIN_ROLE_KEYS,
  SIDEBAR_ADMIN_PERMISSION_KEYS,
  SIDEBAR_ADMIN_FLAG_KEYS,
} from "./constants.js";

/* =========================================================
   VERSION
========================================================= */

export const SIDEBAR_USER_VERSION =
  "sidebar-user-v16-extreme-avatar-auth-safe";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_DISPLAY_NAME =
  "Usuario";

const DEFAULT_AVATAR_TEXT =
  "ON";

const DEFAULT_PLAN_LABEL =
  "Go Plan";

const LOG_PREFIX =
  "[SidebarUser]";

const SOURCE =
  "SidebarUser";

const OWNER =
  "user.js";

const AVATAR_CACHE_PARAM =
  "v";

const AVATAR_RENDER_SEQ_DATASET_KEY =
  "avatarRenderSeq";

const AVATAR_URL_HASH_DATASET_KEY =
  "avatarUrlHash";

const AVATAR_COLOR_STORAGE_KEY =
  "onion:sidebar:avatar:color";

const AVATAR_COLOR_SCOPE_STORAGE_KEY =
  "onion:sidebar:avatar:color:scope";

const AVATAR_GRADIENTS =
  Object.freeze([
    "linear-gradient(135deg, #6f59d9, #38bdf8)",
    "linear-gradient(135deg, #ec4899, #8b5cf6)",
    "linear-gradient(135deg, #22c55e, #14b8a6)",
    "linear-gradient(135deg, #f97316, #ef4444)",
    "linear-gradient(135deg, #0ea5e9, #6366f1)",
    "linear-gradient(135deg, #a855f7, #f43f5e)",
    "linear-gradient(135deg, #14b8a6, #6366f1)",
    "linear-gradient(135deg, #f59e0b, #ec4899)",
    "linear-gradient(135deg, #06b6d4, #8b5cf6)",
    "linear-gradient(135deg, #84cc16, #10b981)",
    "linear-gradient(135deg, #fb7185, #f97316)",
    "linear-gradient(135deg, #64748b, #0f172a)",
  ]);

const DEFAULT_ADMIN_ROLE_KEYS =
  Object.freeze([
    "admin",
    "administrator",
    "superadmin",
    "super_admin",
    "owner",
    "root",
    "support_admin",
    "soporte_admin",
    "sysadmin",
    "system_admin",
    "platform_admin",
  ]);

const DEFAULT_ADMIN_PERMISSION_KEYS =
  Object.freeze([
    "*",
    "admin",
    "admin:*",
    "admin:manage",
    "users:manage",
    "usuarios:manage",
    "server:manage",
    "servidor:manage",
    "settings:manage",
    "ajustes:manage",
    "billing:manage",
    "facturas:manage",
  ]);

const DEFAULT_ADMIN_FLAG_KEYS =
  Object.freeze([
    "isAdmin",
    "admin",
    "is_admin",
    "isSuperAdmin",
    "superAdmin",
    "super_admin",
    "canManageUsers",
    "canAccessUsers",
    "canManageServer",
    "canAccessServer",
    "canManageSettings",
    "canAccessSettings",
    "canManageBilling",
  ]);

const ADMIN_ROLE_KEYS =
  Array.isArray(SIDEBAR_ADMIN_ROLE_KEYS) &&
  SIDEBAR_ADMIN_ROLE_KEYS.length
    ? SIDEBAR_ADMIN_ROLE_KEYS
    : DEFAULT_ADMIN_ROLE_KEYS;

const ADMIN_PERMISSION_KEYS =
  Array.isArray(SIDEBAR_ADMIN_PERMISSION_KEYS) &&
  SIDEBAR_ADMIN_PERMISSION_KEYS.length
    ? SIDEBAR_ADMIN_PERMISSION_KEYS
    : DEFAULT_ADMIN_PERMISSION_KEYS;

const ADMIN_FLAG_KEYS =
  Array.isArray(SIDEBAR_ADMIN_FLAG_KEYS) &&
  SIDEBAR_ADMIN_FLAG_KEYS.length
    ? SIDEBAR_ADMIN_FLAG_KEYS
    : DEFAULT_ADMIN_FLAG_KEYS;

const EVENTS =
  Object.freeze({
    userRendered:
      SIDEBAR_EVENTS?.userRendered ||
      "sidebar:user:rendered",

    userAvatarLoaded:
      SIDEBAR_EVENTS?.userAvatarLoaded ||
      "sidebar:user:avatar:loaded",

    userAvatarError:
      SIDEBAR_EVENTS?.userAvatarError ||
      "sidebar:user:avatar:error",

    userFallbackRendered:
      "sidebar:user:avatar:fallback",

    userAvatarColorReset:
      "sidebar:user:avatar:color:reset",
  });

const STORAGE_USER_KEYS =
  Object.freeze([
    "user",
    "currentUser",
    "auth.user",
    "session.user",
    "auth:user",
    "session:user",

    "onion:user",
    "onion_user",
    "onion:auth:user",
    "onion:session:user",

    "app:user",
    "app_user",
    "app:auth:user",
    "app:session:user",
  ]);

const STORAGE_AUTH_EVIDENCE_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "refreshToken",
    "refresh_token",
    "tempToken",
    "temp_token",
    "sessionId",
    "session_id",
    "sessionUserId",
    "session_user_id",

    "onion_token",
    "onion_access_token",
    "onion_refresh_token",
    "onion_temp_token",
    "onion_session_id",
    "onion_session_user_id",

    "auth.token",
    "auth.accessToken",
    "auth.refreshToken",
    "auth.tempToken",
    "auth.sessionId",
    "auth.sessionUserId",

    "auth:token",
    "auth:accessToken",
    "auth:refreshToken",
    "auth:tempToken",
    "auth:sessionId",
    "auth:sessionUserId",
  ]);

const SAFE_DATA_IMAGE_PREFIXES =
  Object.freeze([
    "data:image/png",
    "data:image/jpeg",
    "data:image/jpg",
    "data:image/gif",
    "data:image/webp",
    "data:image/avif",
    "data:image/bmp",
  ]);

const SENSITIVE_PARAM_NAMES =
  Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "resetToken",
    "passwordResetToken",
    "confirmToken",
    "code",
    "t",
    "access_token",
    "refresh_token",
    "id_token",
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "sig",
    "signature",
    "se",
    "sp",
    "sv",
    "sr",
    "skoid",
    "sktid",
    "skt",
    "ske",
    "sks",
    "skv",
  ]);

const INACTIVE_STATUS_VALUES =
  Object.freeze([
    "disabled",
    "inactive",
    "deleted",
    "blocked",
    "suspended",
    "banned",
    "revoked",
    "archived",
    "deactivated",
  ]);

let memoryAvatarGradient =
  "";

let memoryAvatarGradientScope =
  "";

let cachedAdminRoleSet =
  null;

let cachedAdminPermissionSet =
  null;

/* =========================================================
   BASIC HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function hasWindow() {
  return typeof window !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  return text || fallback;
}

function safeObject(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  )
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
}

function isNonEmptyObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length > 0
  );
}

function first(...values) {
  for (const value of values) {
    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    if (
      Array.isArray(value) &&
      value.length === 0
    ) {
      continue;
    }

    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function safeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const key =
      value
        .trim()
        .toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "si",
        "sí",
        "ok",
        "on",
        "y",
      ].includes(key)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
        "n",
      ].includes(key)
    ) {
      return false;
    }
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  return fallback;
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeWarn(AppCore, ...args) {
  try {
    AppCore?.utils?.warn?.(
      LOG_PREFIX,
      ...args.map((item) => sanitizePayload(item))
    );

    return;
  } catch {}

  try {
    console.warn(
      LOG_PREFIX,
      ...args.map((item) => sanitizePayload(item))
    );
  } catch {}
}

function normalizeString(value = "") {
  return safeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getBaseOrigin() {
  try {
    if (
      isBrowser() &&
      window.location?.origin
    ) {
      return window.location.origin;
    }
  } catch {}

  return "http://localhost";
}

function hashString(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return "";
  }

  let hash =
    2166136261;

  try {
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return `h${(hash >>> 0).toString(36)}`;
  } catch {
    return `h${Math.abs(text.length || 0).toString(36)}`;
  }
}

function safeCssIdSelector(id = "") {
  const cleanId =
    safeText(id, "");

  if (!cleanId) {
    return "";
  }

  try {
    if (
      isBrowser() &&
      window.CSS &&
      isFn(window.CSS.escape)
    ) {
      return `#${window.CSS.escape(cleanId)}`;
    }
  } catch {}

  return `#${cleanId.replace(/[^A-Za-z0-9_-]/g, "\\$&")}`;
}

function isPlaceholderText(value = "") {
  const text =
    safeText(value, "")
      .toLowerCase();

  return (
    !text ||
    [
      "null",
      "undefined",
      "false",
      "true",
      "nan",
      "none",
      "[object object]",
      "object object",
    ].includes(text)
  );
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

    element.dataset[key] =
      String(value);

    return true;
  } catch {
    return false;
  }
}

function removeTooltipAttributes(element = null) {
  if (!element) {
    return false;
  }

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
  if (!element) {
    return false;
  }

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

/* =========================================================
   REDACTION / SANITIZE
========================================================= */

function escapeRegExp(value = "") {
  return String(value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}

function redactSensitiveText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  for (const name of SENSITIVE_PARAM_NAMES) {
    try {
      const escaped =
        escapeRegExp(name);

      output =
        output.replace(
          new RegExp(`([?&#]${escaped}=)([^&#\\s]+)`, "gi"),
          "$1***"
        );
    } catch {}
  }

  try {
    output =
      output.replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /(authorization["'\s:=]+)(Bearer\s+)?([A-Za-z0-9._~+/=-]+)/gi,
        "$1$2***"
      );
  } catch {}

  try {
    output =
      output.replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function isDomNodeLike(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  try {
    return Boolean(
      typeof Node !== "undefined" &&
        value instanceof Node
    );
  } catch {}

  try {
    return Boolean(
      value.nodeType &&
        value.nodeName
    );
  } catch {}

  return false;
}

function sanitizePayload(value, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactSensitiveText(value);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "function") {
    return "[Function]";
  }

  if (isDomNodeLike(value)) {
    return {
      node:
        safeText(value.nodeName, "Node"),

      id:
        safeText(value.id, ""),

      className:
        safeText(
          value.className?.baseVal ||
            value.className,
          ""
        ),
    };
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizePayload(item, depth + 1)
      );
  }

  if (value instanceof Error) {
    return {
      name:
        safeText(value.name, "Error"),

      message:
        redactSensitiveText(value.message || ""),

      code:
        value.code || null,

      status:
        value.status || value.statusCode || null,

      stack:
        redactSensitiveText(value.stack || ""),
    };
  }

  if (value instanceof Map) {
    return {
      type:
        "Map",
      size:
        value.size,
    };
  }

  if (value instanceof Set) {
    return {
      type:
        "Set",
      size:
        value.size,
    };
  }

  if (
    value &&
    typeof value === "object"
  ) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (
        /token|secret|password|authorization|credential|jwt|bearer|otp|code|sig|signature/i.test(key)
      ) {
        if (
          item === null ||
          item === undefined ||
          item === "" ||
          typeof item === "boolean"
        ) {
          output[key] = item;
        } else {
          output[key] = "***";
        }

        continue;
      }

      output[key] =
        sanitizePayload(
          item,
          depth + 1
        );
    }

    return output;
  }

  return String(value);
}

function safeEmit(AppCore, eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const data =
    safeObject(payload);

  const finalPayload =
    sanitizePayload({
      ...data,

      source:
        safeText(data.source, SOURCE),

      owner:
        OWNER,

      version:
        SIDEBAR_USER_VERSION,

      at:
        safeText(data.at, safeIsoDate()),

      ts:
        data.ts || nowMs(),
    });

  try {
    if (isFn(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        finalPayload
      );

      return true;
    }
  } catch (error) {
    safeWarn(
      AppCore,
      `AppCore.events.emit("${name}") falló.`,
      error
    );
  }

  try {
    if (
      isBrowser() &&
      typeof CustomEvent !== "undefined"
    ) {
      window.dispatchEvent(
        new CustomEvent(
          name,
          {
            detail:
              finalPayload,
          }
        )
      );

      return true;
    }
  } catch {}

  return false;
}

/* =========================================================
   MODULE / AUTH SOURCES
========================================================= */

function callGetter(source = null, methodName = "") {
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

function getModule(AppCore = null, name = "") {
  const cleanName =
    safeText(name, "");

  if (
    !AppCore ||
    !cleanName
  ) {
    return null;
  }

  try {
    if (isFn(AppCore?.modules?.get)) {
      const value =
        AppCore.modules.get(cleanName);

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    return AppCore?.modules?.[cleanName] || null;
  } catch {
    return null;
  }
}

function getGlobalCandidate(name = "") {
  if (!hasWindow()) {
    return null;
  }

  const cleanName =
    safeText(name, "");

  if (!cleanName) {
    return null;
  }

  try {
    return window?.[cleanName] || null;
  } catch {
    return null;
  }
}

function uniqueObjects(values = []) {
  const seen =
    new Set();

  const result =
    [];

  values.forEach((value) => {
    if (
      !value ||
      typeof value !== "object"
    ) {
      return;
    }

    if (seen.has(value)) {
      return;
    }

    seen.add(value);
    result.push(value);
  });

  return result;
}

function getAuthLikeSources(AppCore = null) {
  return uniqueObjects(
    [
      AppCore?.Auth,
      AppCore?.auth,
      AppCore?.features?.auth,
      AppCore?.state?.auth,

      getModule(AppCore, "Auth"),
      getModule(AppCore, "auth"),
      getModule(AppCore, "Session"),
      getModule(AppCore, "session"),

      getGlobalCandidate("Auth"),
      getGlobalCandidate("OnionAuth"),
      getGlobalCandidate("Session"),
      getGlobalCandidate("OnionSession"),
    ]
  );
}

function unwrapUserPayload(payload = null) {
  const value =
    safeObject(payload);

  if (!isNonEmptyObject(value)) {
    return {};
  }

  const candidate =
    first(
      value.user,
      value.usuario,
      value.currentUser,
      value.profile,
      value.account?.user,
      value.account,
      value.session?.user,
      value.session?.currentUser,
      value.data?.user,
      value.data?.usuario,
      value.data?.currentUser,
      value.data?.profile,
      value.payload?.user,
      value.payload?.usuario,
      value.payload?.currentUser,
      value.result?.user,
      value.result?.currentUser,
      value.me,
      value
    );

  return safeObject(candidate);
}

function getUserFromAuthLikeSources(AppCore = null) {
  const sources =
    getAuthLikeSources(AppCore);

  for (const source of sources) {
    const user =
      first(
        callGetter(source, "getUser"),
        callGetter(source, "getCurrentUser"),
        callGetter(source, "currentUser"),
        callGetter(source, "getProfile"),
        callGetter(source, "getSessionUser"),
        callGetter(source, "getAccount"),

        source?.user,
        source?.usuario,
        source?.currentUser,
        source?.profile,
        source?.account,
        source?.state?.user,
        source?.state?.usuario,
        source?.state?.currentUser,
        source?.state?.profile,
        source?.session?.user,
        source?.session?.currentUser,
        source?.session?.profile
      );

    const unwrapped =
      unwrapUserPayload(user);

    if (
      isNonEmptyObject(unwrapped) &&
      hasUsableUserIdentity(unwrapped)
    ) {
      return unwrapped;
    }
  }

  return {};
}

/* =========================================================
   STORAGE / AUTH EVIDENCE
========================================================= */

function tryParseJson(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readStorageValue(key = "") {
  if (!isBrowser()) {
    return "";
  }

  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return "";
  }

  try {
    const value =
      window.localStorage?.getItem?.(cleanKey);

    if (value) {
      return safeText(value, "");
    }
  } catch {}

  try {
    const value =
      window.sessionStorage?.getItem?.(cleanKey);

    if (value) {
      return safeText(value, "");
    }
  } catch {}

  return "";
}

function getStoragePrefix(AppCore = null) {
  return safeText(
    AppCore?.config?.storagePrefix ||
      AppCore?.config?.storageKeyPrefix ||
      AppCore?.config?.appKey ||
      "onion",
    "onion"
  );
}

function buildPrefixedKeys(AppCore = null, baseKeys = []) {
  const prefix =
    getStoragePrefix(AppCore);

  const result =
    [];

  safeArray(baseKeys).forEach((key) => {
    const cleanKey =
      safeText(key, "");

    if (!cleanKey) {
      return;
    }

    result.push(cleanKey);
    result.push(`${prefix}:${cleanKey}`);
    result.push(`${prefix}_${cleanKey.replace(/[.:]/g, "_")}`);
  });

  return Array.from(
    new Set(result)
  );
}

function hasStoredAuthEvidence(AppCore = null) {
  const keys =
    buildPrefixedKeys(
      AppCore,
      STORAGE_AUTH_EVIDENCE_KEYS
    );

  return keys.some((key) =>
    Boolean(readStorageValue(key))
  );
}

function hasRuntimeAuthEvidence(AppCore = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const authLikeSources =
    getAuthLikeSources(AppCore);

  const direct =
    first(
      state.token,
      state.accessToken,
      state.access_token,
      state.authToken,
      state.auth_token,
      state.jwt,
      state.refreshToken,
      state.refresh_token,
      state.sessionId,
      state.session_id,
      state.sessionUserId,
      state.session_user_id,

      session.token,
      session.accessToken,
      session.access_token,
      session.authToken,
      session.auth_token,
      session.jwt,
      session.refreshToken,
      session.refresh_token,
      session.sessionId,
      session.session_id,
      session.userId,
      session.user_id,

      state.auth?.token,
      state.auth?.accessToken,
      state.auth?.access_token,
      state.auth?.refreshToken,
      state.auth?.refresh_token,
      state.auth?.sessionId,
      state.auth?.session_id
    );

  if (safeText(direct, "")) {
    return true;
  }

  return authLikeSources.some((source) => {
    try {
      if (safeBoolean(callGetter(source, "isAuthenticated"), false)) {
        return true;
      }

      if (safeBoolean(callGetter(source, "hasValidToken"), false)) {
        return true;
      }

      if (safeBoolean(callGetter(source, "hasRefreshContext"), false)) {
        return true;
      }
    } catch {}

    return Boolean(
      safeText(source?.token, "") ||
        safeText(source?.accessToken, "") ||
        safeText(source?.access_token, "") ||
        safeText(source?.refreshToken, "") ||
        safeText(source?.refresh_token, "") ||
        safeText(source?.session?.token, "") ||
        safeText(source?.session?.accessToken, "")
    );
  });
}

function isAuthRestoreInProgress(AppCore = null) {
  const state =
    safeObject(AppCore?.state);

  return Boolean(
    state.restoring === true ||
      state.authRestoring === true ||
      state.sessionRestoring === true ||
      state.restoreInProgress === true ||
      state.sessionRestoreInProgress === true ||
      state.authRestoreInProgress === true ||
      state.auth?.restoreInProgress === true ||
      state.auth?.sessionRestoreInProgress === true
  );
}

function isExplicitlyUnauthenticated(AppCore = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const authValues =
    [
      state.authenticated,
      state.isAuthenticated,
      state.auth?.authenticated,
      state.auth?.isAuthenticated,
      session.authenticated,
      session.isAuthenticated,
    ];

  const hasTrue =
    authValues.some((value) => value === true);

  const hasFalse =
    authValues.some((value) => value === false);

  return hasFalse && !hasTrue;
}

function shouldUseStoredUserFallback(AppCore = null) {
  /*
    Anti-ghost:
    Si AppCore declaró sesión no autenticada, NO se resucita usuario
    desde storage. El restore oficial repintará cuando corresponda.
  */
  if (
    isExplicitlyUnauthenticated(AppCore) &&
    !isAuthRestoreInProgress(AppCore)
  ) {
    return false;
  }

  return Boolean(
    hasRuntimeAuthEvidence(AppCore) ||
      hasStoredAuthEvidence(AppCore)
  );
}

function getStoredUserFallback(AppCore = null) {
  if (!shouldUseStoredUserFallback(AppCore)) {
    return {};
  }

  const keys =
    buildPrefixedKeys(
      AppCore,
      STORAGE_USER_KEYS
    );

  for (const key of keys) {
    const raw =
      readStorageValue(key);

    const parsed =
      tryParseJson(raw);

    const unwrapped =
      unwrapUserPayload(parsed);

    if (
      isNonEmptyObject(unwrapped) &&
      hasUsableUserIdentity(unwrapped)
    ) {
      return unwrapped;
    }
  }

  return {};
}

/* =========================================================
   USER RESOLUTION
========================================================= */

export function getUser(AppCore) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  if (
    isExplicitlyUnauthenticated(AppCore) &&
    !isAuthRestoreInProgress(AppCore)
  ) {
    return {};
  }

  let user =
    first(
      state.user,
      state.usuario,
      state.currentUser,
      state.sessionUser,
      state.authUser,
      state.profile,
      state.account,

      session.user,
      session.usuario,
      session.currentUser,
      session.profile,
      session.account,
      session.data?.user,

      state.auth?.user,
      state.auth?.usuario,
      state.auth?.currentUser,
      state.auth?.profile,
      state.auth?.account
    );

  user =
    unwrapUserPayload(user);

  if (!isNonEmptyObject(user)) {
    user =
      unwrapUserPayload(
        first(
          callGetter(AppCore, "getUser"),
          callGetter(AppCore, "getCurrentUser"),
          callGetter(AppCore, "currentUser"),
          callGetter(AppCore, "getProfile"),
          callGetter(AppCore, "getAccount")
        )
      );
  }

  if (!isNonEmptyObject(user)) {
    user =
      getUserFromAuthLikeSources(AppCore);
  }

  if (!isNonEmptyObject(user)) {
    user =
      getStoredUserFallback(AppCore);
  }

  if (!hasUsableUserIdentity(user)) {
    return {};
  }

  return safeObject(user);
}

function getProfileLikeBranches(user = null) {
  const current =
    safeObject(user);

  return [
    current,

    safeObject(current.user),
    safeObject(current.usuario),
    safeObject(current.profile),
    safeObject(current.account),
    safeObject(current.customer),
    safeObject(current.client),
    safeObject(current.cliente),
    safeObject(current.meta),
    safeObject(current.claims),
    safeObject(current.permissions),
    safeObject(current.billing),

    safeObject(current.raw),
    safeObject(current.raw?.user),
    safeObject(current.raw?.usuario),
    safeObject(current.raw?.profile),
    safeObject(current.raw?.account),
    safeObject(current.raw?.customer),
    safeObject(current.raw?.client),
    safeObject(current.raw?.cliente),
    safeObject(current.raw?.meta),
    safeObject(current.raw?.claims),
    safeObject(current.raw?.permissions),
    safeObject(current.raw?.billing),

    safeObject(current.profile?.account),
    safeObject(current.account?.profile),
    safeObject(current.meta?.profile),
    safeObject(current.claims?.profile),
  ].filter(isNonEmptyObject);
}

function isBranchMarkedInactive(branch = null) {
  const current =
    safeObject(branch);

  if (!isNonEmptyObject(current)) {
    return false;
  }

  const status =
    safeText(
      first(
        current.status,
        current.estado,
        current.state,
        current.accountStatus,
        current.account_status,
        current.userStatus,
        current.user_status
      ),
      ""
    )
      .toLowerCase()
      .trim();

  if (
    status &&
    INACTIVE_STATUS_VALUES.includes(status)
  ) {
    return true;
  }

  if (
    current.disabled === true ||
    current.isDisabled === true ||
    current.is_disabled === true ||
    current.deleted === true ||
    current.isDeleted === true ||
    current.is_deleted === true ||
    current.blocked === true ||
    current.isBlocked === true ||
    current.is_blocked === true ||
    current.suspended === true ||
    current.isSuspended === true ||
    current.is_suspended === true
  ) {
    return true;
  }

  const activeCandidate =
    first(
      current.active,
      current.isActive,
      current.is_active,
      current.enabled,
      current.isEnabled,
      current.is_enabled
    );

  if (
    activeCandidate !== null &&
    activeCandidate !== undefined &&
    activeCandidate !== ""
  ) {
    return !safeBoolean(activeCandidate, true);
  }

  return false;
}

function hasUsableUserIdentity(user = null) {
  const current =
    safeObject(user);

  if (!isNonEmptyObject(current)) {
    return false;
  }

  const branches =
    getProfileLikeBranches(current);

  if (
    branches.some((branch) =>
      isBranchMarkedInactive(branch)
    )
  ) {
    return false;
  }

  return branches.some((branch) => {
    return Boolean(
      safeText(branch.id, "") ||
        safeText(branch.userId, "") ||
        safeText(branch.user_id, "") ||
        safeText(branch._id, "") ||
        safeText(branch.uid, "") ||
        safeText(branch.sub, "") ||
        safeText(branch.username, "") ||
        safeText(branch.userName, "") ||
        safeText(branch.user_name, "") ||
        safeText(branch.preferred_username, "") ||
        safeText(branch.email, "") ||
        safeText(branch.mail, "") ||
        safeText(branch.phone, "") ||
        safeText(branch.telefono, "") ||
        safeText(branch.displayName, "") ||
        safeText(branch.display_name, "") ||
        safeText(branch.fullName, "") ||
        safeText(branch.full_name, "") ||
        safeText(branch.name, "") ||
        safeText(branch.nombre, "")
    );
  });
}

/* =========================================================
   DISPLAY / USERNAME
========================================================= */

function coerceDisplayValue(value = "") {
  const text =
    safeText(value, "");

  if (isPlaceholderText(text)) {
    return "";
  }

  return text;
}

export function getDisplayName(AppCore, user = null) {
  const currentUser =
    safeObject(user || getUser(AppCore));

  if (!hasUsableUserIdentity(currentUser)) {
    return DEFAULT_DISPLAY_NAME;
  }

  const branches =
    getProfileLikeBranches(currentUser);

  try {
    if (isFn(AppCore?.getUserDisplayName)) {
      const value =
        coerceDisplayValue(
          AppCore.getUserDisplayName(currentUser)
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (isFn(AppCore?.utils?.getUserDisplayName)) {
      const value =
        coerceDisplayValue(
          AppCore.utils.getUserDisplayName(currentUser)
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  const value =
    first(
      ...branches.flatMap((branch) => [
        branch.displayName,
        branch.display_name,
        branch.fullName,
        branch.full_name,
        branch.name,
        branch.nombre,
        branch.razonSocial,
        branch.razon_social,
        branch.company,
        branch.companyName,
        branch.company_name,

        branch.firstName && branch.lastName
          ? `${branch.firstName} ${branch.lastName}`
          : null,

        branch.first_name && branch.last_name
          ? `${branch.first_name} ${branch.last_name}`
          : null,

        branch.given_name && branch.family_name
          ? `${branch.given_name} ${branch.family_name}`
          : null,

        branch.username,
        branch.userName,
        branch.user_name,
        branch.preferred_username,
        branch.email,
        branch.mail,
        branch.phone,
        branch.telefono,
      ])
    );

  return coerceDisplayValue(value) || DEFAULT_DISPLAY_NAME;
}

function sanitizeUsername(value = "") {
  return normalizeString(value)
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function usernameFromEmail(email = "") {
  const text =
    safeText(email, "");

  if (!text.includes("@")) {
    return "";
  }

  return sanitizeUsername(
    text.split("@")[0]
  );
}

export function getUsername(AppCore, user = null) {
  const currentUser =
    safeObject(user || getUser(AppCore));

  if (!hasUsableUserIdentity(currentUser)) {
    return "";
  }

  const branches =
    getProfileLikeBranches(currentUser);

  try {
    if (isFn(AppCore?.getUserUsername)) {
      const value =
        sanitizeUsername(
          AppCore.getUserUsername(currentUser)
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  try {
    if (isFn(AppCore?.utils?.getUserUsername)) {
      const value =
        sanitizeUsername(
          AppCore.utils.getUserUsername(currentUser)
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  const direct =
    sanitizeUsername(
      first(
        ...branches.flatMap((branch) => [
          branch.username,
          branch.userName,
          branch.user_name,
          branch.preferred_username,
          branch.slug,
          branch.nick,
          branch.alias,
          branch.handle,
          branch.userId,
          branch.user_id,
          branch.uid,
          branch.sub,
        ])
      )
    );

  if (direct) {
    return direct;
  }

  return usernameFromEmail(
    first(
      ...branches.flatMap((branch) => [
        branch.email,
        branch.mail,
        branch.upn,
      ])
    )
  );
}

/* =========================================================
   AVATAR TEXT · UNICODE SAFE
========================================================= */

function keepAvatarLettersAndNumbers(value = "") {
  const text =
    safeText(value, "");

  if (!text) {
    return "";
  }

  try {
    return Array.from(text)
      .filter((char) => /[\p{L}\p{N}]/u.test(char))
      .join("");
  } catch {
    return text.replace(/[^a-zA-Z0-9À-ÖØ-öø-ÿĀ-ſ]/g, "");
  }
}

function normalizeAvatarText(value = "") {
  const clean =
    keepAvatarLettersAndNumbers(
      safeText(value, DEFAULT_AVATAR_TEXT)
    );

  const compact =
    Array.from(clean)
      .slice(0, 2)
      .join("");

  try {
    return compact.toLocaleUpperCase("es-ES") || DEFAULT_AVATAR_TEXT;
  } catch {
    return compact.toUpperCase() || DEFAULT_AVATAR_TEXT;
  }
}

function extractInitialsFromText(value = "") {
  const text =
    safeText(value, "")
      .replace(/@.*/, "")
      .replace(/\s+/g, " ")
      .trim();

  if (!text) {
    return "";
  }

  const parts =
    text
      .split(/[\s._-]+/u)
      .map((part) =>
        keepAvatarLettersAndNumbers(part)
      )
      .filter(Boolean);

  const initials =
    parts
      .slice(0, 2)
      .map((part) =>
        Array.from(part)[0] || ""
      )
      .join("");

  return normalizeAvatarText(initials);
}

export function getAvatarText(AppCore, user = null) {
  const currentUser =
    safeObject(user || getUser(AppCore));

  if (!hasUsableUserIdentity(currentUser)) {
    return DEFAULT_AVATAR_TEXT;
  }

  const branches =
    getProfileLikeBranches(currentUser);

  const explicit =
    safeText(
      first(
        ...branches.flatMap((branch) => [
          branch.avatarText,
          branch.avatar_text,
          branch.initials,
          branch.iniciales,
        ])
      ),
      ""
    );

  if (explicit) {
    return normalizeAvatarText(explicit);
  }

  const displayName =
    getDisplayName(AppCore, currentUser);

  const username =
    getUsername(AppCore, currentUser);

  const email =
    safeText(
      first(
        ...branches.flatMap((branch) => [
          branch.email,
          branch.mail,
          branch.upn,
        ])
      ),
      ""
    );

  return (
    extractInitialsFromText(displayName) ||
    extractInitialsFromText(username) ||
    extractInitialsFromText(email) ||
    DEFAULT_AVATAR_TEXT
  );
}

/* =========================================================
   AVATAR URL
========================================================= */

function getAvatarUpdatedAt(user = null) {
  const currentUser =
    safeObject(user);

  const branches =
    getProfileLikeBranches(currentUser);

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

        branch.avatarVersion,
        branch.avatar_version,
        branch.pictureVersion,
        branch.picture_version,
        branch.photoVersion,
        branch.photo_version,

        branch.updatedAt,
        branch.updated_at,
        branch.modifiedAt,
        branch.modified_at,
        branch.version,
        branch.etag,
        branch._etag,
      ])
    ),
    ""
  );
}

function userHasAvatar(user = null) {
  const currentUser =
    safeObject(user);

  const branches =
    getProfileLikeBranches(currentUser);

  const rawValue =
    first(
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

  if (
    rawValue === null ||
    rawValue === undefined
  ) {
    return true;
  }

  return safeBoolean(
    rawValue,
    false
  );
}

function coerceAvatarUrlValue(value = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    return safeText(
      first(
        value.url,
        value.href,
        value.src,
        value.uri,
        value.path,
        value.downloadUrl,
        value.download_url,
        value.publicUrl,
        value.public_url,
        value.secureUrl,
        value.secure_url
      ),
      ""
    );
  }

  return safeText(value, "");
}

function isLocalHttpUrl(url) {
  try {
    const parsed =
      new URL(
        url,
        getBaseOrigin()
      );

    return (
      parsed.protocol === "http:" &&
      (
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "::1"
      )
    );
  } catch {
    return false;
  }
}

function sanitizeAvatarUrl(value = "") {
  const raw =
    safeText(
      coerceAvatarUrlValue(value),
      ""
    );

  if (!raw) {
    return "";
  }

  if (/[\r\n\t]/.test(raw)) {
    return "";
  }

  const compact =
    raw.replace(/\s+/g, "");

  const lower =
    compact.toLowerCase();

  if (
    lower.startsWith("javascript:") ||
    lower.startsWith("vbscript:") ||
    lower.startsWith("file:") ||
    lower.startsWith("filesystem:") ||
    lower.startsWith("data:text/") ||
    lower.startsWith("data:application/") ||
    lower.startsWith("data:audio/") ||
    lower.startsWith("data:video/") ||
    lower.startsWith("data:image/svg") ||
    lower.startsWith("//")
  ) {
    return "";
  }

  if (lower.startsWith("data:")) {
    const allowedDataImage =
      SAFE_DATA_IMAGE_PREFIXES.some((prefix) =>
        lower.startsWith(prefix)
      );

    return allowedDataImage
      ? raw
      : "";
  }

  if (lower.startsWith("blob:")) {
    return raw;
  }

  if (
    lower.startsWith("/") ||
    lower.startsWith("./") ||
    lower.startsWith("../")
  ) {
    return raw;
  }

  if (lower.startsWith("http://")) {
    if (!isLocalHttpUrl(raw)) {
      return "";
    }

    try {
      return new URL(raw, getBaseOrigin()).toString();
    } catch {
      return "";
    }
  }

  if (lower.startsWith("https://")) {
    try {
      return new URL(raw, getBaseOrigin()).toString();
    } catch {
      return "";
    }
  }

  if (/^[a-zA-Z0-9._~:/?#@!$&'()*+,;=%-]+$/.test(raw)) {
    return raw.startsWith("/")
      ? raw
      : `/${raw}`;
  }

  return "";
}

function appendAvatarCacheBust(url = "", updatedAt = "") {
  const cleanUrl =
    sanitizeAvatarUrl(url);

  const cleanUpdatedAt =
    safeText(updatedAt, "");

  if (
    !cleanUrl ||
    !cleanUpdatedAt
  ) {
    return cleanUrl;
  }

  const lower =
    cleanUrl.toLowerCase();

  if (
    lower.startsWith("data:") ||
    lower.startsWith("blob:")
  ) {
    return cleanUrl;
  }

  try {
    const parsed =
      new URL(
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
  const currentUser =
    safeObject(user);

  if (
    !Object.keys(currentUser).length ||
    !hasUsableUserIdentity(currentUser)
  ) {
    return "";
  }

  if (!userHasAvatar(currentUser)) {
    return "";
  }

  const branches =
    getProfileLikeBranches(currentUser);

  const explicitAvatar =
    first(
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

        branch.logo,
        branch.logoUrl,
        branch.logo_url,
      ])
    );

  const avatar =
    sanitizeAvatarUrl(explicitAvatar);

  if (!avatar) {
    return "";
  }

  return appendAvatarCacheBust(
    avatar,
    getAvatarUpdatedAt(currentUser)
  );
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

function getAdminRoleSet() {
  if (!cachedAdminRoleSet) {
    cachedAdminRoleSet =
      new Set(
        safeArray(ADMIN_ROLE_KEYS)
          .map(normalizeRole)
          .filter(Boolean)
      );
  }

  return cachedAdminRoleSet;
}

function getAdminPermissionSet() {
  if (!cachedAdminPermissionSet) {
    cachedAdminPermissionSet =
      new Set(
        safeArray(ADMIN_PERMISSION_KEYS)
          .map(normalizeRole)
          .filter(Boolean)
      );
  }

  return cachedAdminPermissionSet;
}

function flattenRoleValue(value, depth = 0) {
  if (depth > 8) {
    return [];
  }

  if (
    value === null ||
    value === undefined
  ) {
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
    const entries =
      Object.entries(value);

    const truthyKeys =
      entries
        .filter(([, entryValue]) =>
          safeBoolean(entryValue, false)
        )
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
  return getAdminRoleSet().has(
    normalizeRole(value)
  );
}

function isAdminPermission(value = "") {
  const key =
    normalizeRole(value);

  if (!key) {
    return false;
  }

  if (getAdminPermissionSet().has(key)) {
    return true;
  }

  return (
    key === "*" ||
    key.startsWith("admin:") ||
    key.startsWith("admin.") ||
    key.includes(":admin") ||
    key.includes(".admin") ||
    key.endsWith(":manage") ||
    key.endsWith(".manage")
  );
}

export function getUserRoles(AppCore, user = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const current =
    safeObject(user || getUser(AppCore));

  const branches =
    getProfileLikeBranches(current);

  const authLikeSources =
    getAuthLikeSources(AppCore);

  const authRoleCandidates =
    authLikeSources.flatMap((source) => {
      return [
        source?.role,
        source?.rol,
        source?.userRole,
        source?.roles,
        source?.permissions,
        source?.scopes,

        source?.state?.role,
        source?.state?.roles,
        source?.state?.permissions,

        callGetter(source, "getRole"),
        callGetter(source, "getCurrentRole"),
        callGetter(source, "getRoles"),
        callGetter(source, "getPermissions"),
        callGetter(source, "getScopes"),
      ];
    });

  const directRoles =
    [
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

  const arrayRoles =
    [
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

  const roles =
    normalizeRoles(
      [
        ...directRoles,
        ...arrayRoles,
        ...authRoleCandidates,
      ]
    );

  const expanded =
    new Set(roles);

  if (
    roles.some(isAdminRole) ||
    roles.some(isAdminPermission)
  ) {
    expanded.add("admin");

    for (const role of getAdminRoleSet()) {
      expanded.add(role);
    }
  }

  return Array.from(expanded)
    .filter(Boolean);
}

function hasAdminFlag(AppCore, user = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const current =
    safeObject(user || getUser(AppCore));

  const branches =
    getProfileLikeBranches(current);

  const authLikeSources =
    getAuthLikeSources(AppCore);

  const flagValues =
    [
      ...safeArray(ADMIN_FLAG_KEYS).flatMap((key) => [
        state?.[key],
        session?.[key],
        current?.[key],
      ]),

      ...branches.flatMap((branch) => {
        return safeArray(ADMIN_FLAG_KEYS).map((key) =>
          branch?.[key]
        );
      }),

      ...authLikeSources.flatMap((source) => [
        ...safeArray(ADMIN_FLAG_KEYS).map((key) =>
          source?.[key]
        ),
        ...safeArray(ADMIN_FLAG_KEYS).map((key) =>
          source?.state?.[key]
        ),

        callGetter(source, "isAdmin"),
        callGetter(source, "isCurrentUserAdmin"),
        callGetter(source, "canManageUsers"),
        callGetter(source, "canAccessUsers"),
        callGetter(source, "canManageServer"),
        callGetter(source, "canAccessServer"),
      ]),
    ];

  return flagValues.some((value) =>
    safeBoolean(value, false)
  );
}

export function isAdmin(AppCore, user = null) {
  const currentUser =
    safeObject(user || getUser(AppCore));

  if (!hasUsableUserIdentity(currentUser)) {
    return false;
  }

  if (hasAdminFlag(AppCore, currentUser)) {
    return true;
  }

  const roles =
    getUserRoles(AppCore, currentUser);

  return roles.some((role) => {
    return (
      isAdminRole(role) ||
      isAdminPermission(role)
    );
  });
}

/* =========================================================
   AVATAR RNG COLOR
========================================================= */

function pickRandomAvatarGradient(previous = "") {
  const previousValue =
    safeText(previous, "");

  const available =
    AVATAR_GRADIENTS.filter((gradient) =>
      gradient !== previousValue
    );

  const list =
    available.length
      ? available
      : AVATAR_GRADIENTS;

  return list[
    Math.floor(Math.random() * list.length)
  ] || AVATAR_GRADIENTS[0];
}

function getAuthTokenFingerprint(AppCore = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const authLikeSources =
    getAuthLikeSources(AppCore);

  const token =
    first(
      state.token,
      state.accessToken,
      state.access_token,
      state.authToken,
      state.auth_token,
      state.jwt,

      session.token,
      session.accessToken,
      session.access_token,
      session.authToken,
      session.auth_token,
      session.jwt,

      state.auth?.token,
      state.auth?.accessToken,
      state.auth?.access_token,
      state.auth?.authToken,
      state.auth?.jwt,

      ...authLikeSources.flatMap((source) => [
        source?.token,
        source?.accessToken,
        source?.access_token,
        source?.authToken,
        source?.auth_token,
        source?.jwt,

        source?.state?.token,
        source?.state?.accessToken,
        source?.state?.access_token,
        source?.state?.authToken,
        source?.state?.jwt,

        source?.session?.token,
        source?.session?.accessToken,
        source?.session?.access_token,
        source?.session?.authToken,
        source?.session?.jwt,

        callGetter(source, "getToken"),
        callGetter(source, "getAccessToken"),
        callGetter(source, "getAuthToken"),
      ])
    );

  const cleanToken =
    safeText(token, "");

  if (!cleanToken) {
    return "";
  }

  return hashString(cleanToken);
}

function getAvatarColorScope(AppCore = null, user = null) {
  const state =
    safeObject(AppCore?.state);

  const session =
    safeObject(state.session);

  const currentUser =
    safeObject(user || getUser(AppCore));

  const branches =
    getProfileLikeBranches(currentUser);

  const tokenFingerprint =
    getAuthTokenFingerprint(AppCore);

  const scope =
    first(
      state.sessionId,
      state.session_id,
      state.authSessionId,
      state.auth_session_id,

      session.id,
      session.sessionId,
      session.session_id,
      session.sid,

      state.loginAt,
      state.loggedAt,
      state.authenticatedAt,
      state.lastLoginAt,
      session.loginAt,
      session.loggedAt,
      session.authenticatedAt,

      tokenFingerprint
        ? `token:${tokenFingerprint}`
        : "",

      ...branches.flatMap((branch) => [
        branch.sessionId,
        branch.session_id,
        branch.sid,
        branch.loginAt,
        branch.loggedAt,
        branch.authenticatedAt,
        branch.authTime,
        branch.auth_time,
        branch.iat,
        branch.exp,
      ]),

      ...branches.flatMap((branch) => [
        branch.userId,
        branch.user_id,
        branch.id,
        branch.uid,
        branch.sub,
        branch.username,
        branch.userName,
        branch.user_name,
        branch.email,
        branch.mail,
      ])
    );

  return safeText(
    scope,
    hasUsableUserIdentity(currentUser)
      ? "user"
      : "anonymous"
  );
}

export function getSessionAvatarGradient(AppCore = null, user = null) {
  const scope =
    getAvatarColorScope(AppCore, user);

  try {
    if (!isBrowser()) {
      throw new Error("Browser storage unavailable.");
    }

    const storedScope =
      window.sessionStorage?.getItem?.(
        AVATAR_COLOR_SCOPE_STORAGE_KEY
      );

    const storedGradient =
      window.sessionStorage?.getItem?.(
        AVATAR_COLOR_STORAGE_KEY
      );

    if (
      storedGradient &&
      storedScope === scope &&
      AVATAR_GRADIENTS.includes(storedGradient)
    ) {
      memoryAvatarGradient =
        storedGradient;

      memoryAvatarGradientScope =
        scope;

      return storedGradient;
    }

    const nextGradient =
      pickRandomAvatarGradient(
        storedGradient || ""
      );

    window.sessionStorage?.setItem?.(
      AVATAR_COLOR_STORAGE_KEY,
      nextGradient
    );

    window.sessionStorage?.setItem?.(
      AVATAR_COLOR_SCOPE_STORAGE_KEY,
      scope
    );

    memoryAvatarGradient =
      nextGradient;

    memoryAvatarGradientScope =
      scope;

    return nextGradient;
  } catch {
    if (
      memoryAvatarGradient &&
      memoryAvatarGradientScope === scope
    ) {
      return memoryAvatarGradient;
    }

    memoryAvatarGradient =
      pickRandomAvatarGradient(memoryAvatarGradient);

    memoryAvatarGradientScope =
      scope;

    return memoryAvatarGradient;
  }
}

function applyAvatarSessionColor(
  avatarEl = null,
  fallbackEl = null,
  AppCore = null,
  user = null
) {
  const gradient =
    getSessionAvatarGradient(AppCore, user);

  [avatarEl, fallbackEl].forEach((node) => {
    if (!node) {
      return;
    }

    try {
      node.style.setProperty(
        "--sidebar-avatar-bg",
        gradient
      );

      node.style.setProperty(
        "--avatar-bg",
        gradient
      );

      node.style.setProperty(
        "--user-avatar-bg",
        gradient
      );
    } catch {}
  });

  try {
    if (avatarEl) {
      avatarEl.dataset.avatarColor =
        gradient;

      avatarEl.dataset.avatarColorHash =
        hashString(gradient);
    }
  } catch {}

  return gradient;
}

export function resetSidebarAvatarColor(AppCore = null) {
  memoryAvatarGradient =
    "";

  memoryAvatarGradientScope =
    "";

  try {
    if (isBrowser()) {
      window.sessionStorage?.removeItem?.(
        AVATAR_COLOR_STORAGE_KEY
      );

      window.sessionStorage?.removeItem?.(
        AVATAR_COLOR_SCOPE_STORAGE_KEY
      );
    }
  } catch {}

  safeEmit(
    AppCore,
    EVENTS.userAvatarColorReset,
    {
      reset:
        true,
    }
  );

  return true;
}

/* =========================================================
   AVATAR DOM HELPERS
========================================================= */

function getAvatarNodes(avatarEl) {
  if (!avatarEl) {
    return {
      imgEl:
        null,

      fallbackEl:
        null,
    };
  }

  let imgEl =
    null;

  let fallbackEl =
    null;

  try {
    const imageId =
      safeText(SIDEBAR_AVATAR_IMAGE_ID, "");

    imgEl =
      (
        imageId
          ? avatarEl.querySelector(safeCssIdSelector(imageId))
          : null
      ) ||
      avatarEl.querySelector(".avatar-image") ||
      avatarEl.querySelector("img") ||
      null;
  } catch {}

  try {
    const fallbackId =
      safeText(SIDEBAR_AVATAR_FALLBACK_ID, "");

    fallbackEl =
      (
        fallbackId
          ? avatarEl.querySelector(safeCssIdSelector(fallbackId))
          : null
      ) ||
      avatarEl.querySelector(".avatar-fallback") ||
      null;
  } catch {}

  return {
    imgEl,
    fallbackEl,
  };
}

function syncAvatarBaseAttrs(avatarEl, displayName) {
  if (!avatarEl) {
    return;
  }

  const finalDisplayName =
    safeText(
      displayName,
      DEFAULT_DISPLAY_NAME
    );

  try {
    avatarEl.setAttribute(
      "aria-label",
      `Avatar de ${finalDisplayName}`
    );

    avatarEl.dataset.displayName =
      finalDisplayName;
  } catch {}

  removeTooltipAttributesDeep(avatarEl);
}

function clearImageNode(imgEl = null) {
  if (!imgEl) {
    return;
  }

  try {
    imgEl.onload =
      null;

    imgEl.onerror =
      null;

    imgEl.hidden =
      true;

    imgEl.removeAttribute("src");
    imgEl.removeAttribute("srcset");
    imgEl.removeAttribute("sizes");
    imgEl.removeAttribute("title");
    imgEl.removeAttribute("data-tooltip");
    imgEl.removeAttribute("data-i18n-data-tooltip");
    imgEl.removeAttribute("aria-describedby");
  } catch {}
}

function setFallbackNode({
  avatarEl,
  fallbackEl,
  text,
  visible,
}) {
  const finalText =
    normalizeAvatarText(text);

  if (fallbackEl) {
    try {
      fallbackEl.hidden =
        !visible;

      fallbackEl.textContent =
        finalText;

      fallbackEl.setAttribute(
        "aria-hidden",
        "true"
      );

      removeTooltipAttributes(fallbackEl);
    } catch {}

    return true;
  }

  if (
    avatarEl &&
    visible
  ) {
    try {
      if (!avatarEl.querySelector?.("img,.avatar-fallback")) {
        avatarEl.textContent =
          finalText;

        return true;
      }
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
    error = false,
  } = {}
) {
  if (!avatarEl) {
    return false;
  }

  const cleanUrl =
    safeText(url, "");

  try {
    avatarEl.classList.toggle(
      "has-image",
      Boolean(hasImage)
    );

    avatarEl.classList.toggle(
      "has-fallback",
      !hasImage
    );

    avatarEl.classList.toggle(
      "is-loading",
      Boolean(loading)
    );

    avatarEl.classList.toggle(
      "has-error",
      Boolean(error)
    );

    avatarEl.dataset.hasImage =
      hasImage ? "true" : "false";

    avatarEl.dataset.loading =
      loading ? "true" : "false";

    avatarEl.dataset.avatarError =
      error ? "true" : "false";

    if (cleanUrl) {
      avatarEl.dataset.avatarUrl =
        redactSensitiveText(cleanUrl);

      avatarEl.dataset[AVATAR_URL_HASH_DATASET_KEY] =
        hashString(cleanUrl);
    } else {
      delete avatarEl.dataset.avatarUrl;
      delete avatarEl.dataset[AVATAR_URL_HASH_DATASET_KEY];
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
    Number(
      avatarEl.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] || 0
    );

  const next =
    Number.isFinite(current)
      ? current + 1
      : nowMs();

  try {
    avatarEl.dataset[AVATAR_RENDER_SEQ_DATASET_KEY] =
      String(next);
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
  avatarText = DEFAULT_AVATAR_TEXT,
  options = {}
) {
  if (!avatarEl) {
    return false;
  }

  const AppCore =
    options?.AppCore || null;

  const user =
    options?.user || null;

  const finalDisplayName =
    safeText(
      displayName,
      DEFAULT_DISPLAY_NAME
    );

  const finalAvatarText =
    normalizeAvatarText(avatarText);

  const {
    imgEl,
    fallbackEl,
  } =
    getAvatarNodes(avatarEl);

  const avatarColor =
    applyAvatarSessionColor(
      avatarEl,
      fallbackEl,
      AppCore,
      user
    );

  nextAvatarRenderSeq(avatarEl);

  syncAvatarBaseAttrs(
    avatarEl,
    finalDisplayName
  );

  clearImageNode(imgEl);

  setFallbackNode(
    {
      avatarEl,
      fallbackEl,
      text:
        finalAvatarText,
      visible:
        true,
    }
  );

  setAvatarState(
    avatarEl,
    {
      hasImage:
        false,

      loading:
        false,

      url:
        "",

      error:
        false,
    }
  );

  safeEmit(
    AppCore,
    EVENTS.userFallbackRendered,
    {
      displayName:
        finalDisplayName,

      avatarText:
        finalAvatarText,

      avatarColor,
    }
  );

  return true;
}

export function renderAvatarImage(
  avatarEl,
  avatarUrl,
  displayName = DEFAULT_DISPLAY_NAME,
  avatarText = DEFAULT_AVATAR_TEXT,
  options = {}
) {
  if (!avatarEl) {
    return false;
  }

  const AppCore =
    options?.AppCore || null;

  const user =
    options?.user || null;

  const safeUrl =
    sanitizeAvatarUrl(avatarUrl);

  if (!safeUrl) {
    return renderAvatarFallback(
      avatarEl,
      displayName,
      avatarText,
      {
        AppCore,
        user,
      }
    );
  }

  const finalDisplayName =
    safeText(
      displayName,
      DEFAULT_DISPLAY_NAME
    );

  const finalAvatarText =
    normalizeAvatarText(avatarText);

  const {
    imgEl,
    fallbackEl,
  } =
    getAvatarNodes(avatarEl);

  const avatarColor =
    applyAvatarSessionColor(
      avatarEl,
      fallbackEl,
      AppCore,
      user
    );

  if (!imgEl) {
    return renderAvatarFallback(
      avatarEl,
      finalDisplayName,
      finalAvatarText,
      {
        AppCore,
        user,
      }
    );
  }

  const urlHash =
    hashString(safeUrl);

  const existingUrlHash =
    safeText(
      avatarEl.dataset?.[AVATAR_URL_HASH_DATASET_KEY],
      ""
    );

  /*
    Anti-flicker:
    Si la misma imagen ya está cargada, no reiniciamos la carga.
  */
  if (
    existingUrlHash === urlHash &&
    imgEl.complete === true &&
    Number(imgEl.naturalWidth || 0) > 0 &&
    avatarEl.dataset?.hasImage === "true"
  ) {
    syncAvatarBaseAttrs(
      avatarEl,
      finalDisplayName
    );

    try {
      imgEl.alt =
        `Avatar de ${finalDisplayName}`;

      imgEl.hidden =
        false;
    } catch {}

    setFallbackNode(
      {
        avatarEl,
        fallbackEl,
        text:
          finalAvatarText,
        visible:
          false,
      }
    );

    setAvatarState(
      avatarEl,
      {
        hasImage:
          true,

        loading:
          false,

        url:
          safeUrl,

        error:
          false,
      }
    );

    return true;
  }

  const renderSeq =
    nextAvatarRenderSeq(avatarEl);

  syncAvatarBaseAttrs(
    avatarEl,
    finalDisplayName
  );

  setFallbackNode(
    {
      avatarEl,
      fallbackEl,
      text:
        finalAvatarText,
      visible:
        true,
    }
  );

  setAvatarState(
    avatarEl,
    {
      hasImage:
        false,

      loading:
        true,

      url:
        safeUrl,

      error:
        false,
    }
  );

  try {
    imgEl.hidden =
      true;

    imgEl.alt =
      `Avatar de ${finalDisplayName}`;

    imgEl.loading =
      "eager";

    imgEl.decoding =
      "async";

    imgEl.draggable =
      false;

    try {
      imgEl.referrerPolicy =
        "no-referrer";
    } catch {}

    removeTooltipAttributes(imgEl);

    imgEl.onload =
      () => {
        if (
          !isCurrentAvatarRenderSeq(
            avatarEl,
            renderSeq
          )
        ) {
          return;
        }

        try {
          imgEl.hidden =
            false;
        } catch {}

        setFallbackNode(
          {
            avatarEl,
            fallbackEl,
            text:
              finalAvatarText,
            visible:
              false,
          }
        );

        setAvatarState(
          avatarEl,
          {
            hasImage:
              true,

            loading:
              false,

            url:
              safeUrl,

            error:
              false,
          }
        );

        safeEmit(
          AppCore,
          EVENTS.userAvatarLoaded,
          {
            url:
              redactSensitiveText(safeUrl),

            urlHash,

            displayName:
              finalDisplayName,

            avatarColor,
          }
        );
      };

    imgEl.onerror =
      () => {
        if (
          !isCurrentAvatarRenderSeq(
            avatarEl,
            renderSeq
          )
        ) {
          return;
        }

        setAvatarState(
          avatarEl,
          {
            hasImage:
              false,

            loading:
              false,

            url:
              "",

            error:
              true,
          }
        );

        safeEmit(
          AppCore,
          EVENTS.userAvatarError,
          {
            url:
              redactSensitiveText(safeUrl),

            urlHash,

            displayName:
              finalDisplayName,

            avatarColor,
          }
        );

        renderAvatarFallback(
          avatarEl,
          finalDisplayName,
          finalAvatarText,
          {
            AppCore,
            user,
          }
        );
      };

    try {
      imgEl.removeAttribute("src");
      imgEl.removeAttribute("srcset");
    } catch {}

    imgEl.src =
      safeUrl;

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
      finalAvatarText,
      {
        AppCore,
        user,
      }
    );
  }

  return true;
}

/* =========================================================
   USER PLAN / FOOTER HELPERS
========================================================= */

function getPlanLabel(AppCore, user = null) {
  const state =
    safeObject(AppCore?.state);

  const currentUser =
    safeObject(user || getUser(AppCore));

  const branches =
    getProfileLikeBranches(currentUser);

  const value =
    first(
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
        branch.billing?.plan,
      ])
    );

  return safeText(
    value,
    DEFAULT_PLAN_LABEL
  );
}

function getPlanElement(userToggle = null, explicitPlanEl = null) {
  if (explicitPlanEl) {
    return explicitPlanEl;
  }

  if (!userToggle) {
    return null;
  }

  try {
    const planId =
      safeText(SIDEBAR_USER_PLAN_ID, "");

    return (
      (
        planId
          ? userToggle.querySelector(safeCssIdSelector(planId))
          : null
      ) ||
      userToggle.querySelector(".plan") ||
      userToggle.querySelector(".sidebar-user-plan") ||
      userToggle.querySelector("[data-sidebar-user-plan]") ||
      null
    );
  } catch {
    return null;
  }
}

function setUserDataset(element = null, {
  username = "",
  displayName = "",
  admin = false,
  avatarUrl = "",
  avatarText = "",
  avatarColor = "",
  hasUser = false,
} = {}) {
  if (!element) {
    return false;
  }

  setDatasetValue(element, "username", username || "");
  setDatasetValue(element, "displayName", displayName || "");
  setDatasetValue(element, "admin", admin ? "true" : "false");
  setDatasetValue(element, "avatarUrl", avatarUrl ? redactSensitiveText(avatarUrl) : "");
  setDatasetValue(element, "avatarUrlHash", avatarUrl ? hashString(avatarUrl) : "");
  setDatasetValue(element, "avatarText", avatarText || "");
  setDatasetValue(element, "avatarColor", avatarColor || "");
  setDatasetValue(element, "avatarColorHash", avatarColor ? hashString(avatarColor) : "");
  setDatasetValue(element, "hasUser", hasUser ? "true" : "false");

  return true;
}

function buildPublicUserSnapshot({
  user,
  hasUser,
  displayName,
  avatarText,
  avatarUrl,
  avatarColor,
  username,
  planLabel,
  admin,
  roles,
} = {}) {
  const current =
    safeObject(user);

  return sanitizePayload({
    hasUser:
      Boolean(hasUser),

    user: {
      id:
        safeText(
          first(
            current.id,
            current.userId,
            current.user_id,
            current.uid,
            current.sub
          ),
          ""
        ) || null,

      email:
        safeText(
          first(
            current.email,
            current.mail,
            current.profile?.email,
            current.raw?.email
          ),
          ""
        ) || null,

      username:
        username || null,

      displayName:
        displayName || DEFAULT_DISPLAY_NAME,
    },

    displayName:
      displayName || DEFAULT_DISPLAY_NAME,

    avatarText:
      avatarText || DEFAULT_AVATAR_TEXT,

    avatarUrl:
      avatarUrl
        ? redactSensitiveText(avatarUrl)
        : null,

    avatarUrlHash:
      avatarUrl
        ? hashString(avatarUrl)
        : null,

    avatarColor:
      avatarColor || "",

    avatarColorHash:
      avatarColor
        ? hashString(avatarColor)
        : null,

    username:
      username || null,

    planLabel:
      planLabel || DEFAULT_PLAN_LABEL,

    isAdmin:
      Boolean(admin),

    roles:
      Array.isArray(roles)
        ? roles
        : [],
  });
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
    planEl,
  } =
    getElements(AppCore);

  const user =
    getUser(AppCore);

  const hasUser =
    hasUsableUserIdentity(user);

  const displayName =
    hasUser
      ? getDisplayName(AppCore, user)
      : DEFAULT_DISPLAY_NAME;

  const avatarText =
    hasUser
      ? getAvatarText(AppCore, user)
      : DEFAULT_AVATAR_TEXT;

  const username =
    hasUser
      ? getUsername(AppCore, user)
      : "";

  const avatarUrl =
    hasUser
      ? getAvatarUrl(user)
      : "";

  const admin =
    hasUser
      ? isAdmin(AppCore, user)
      : false;

  const roles =
    hasUser
      ? getUserRoles(AppCore, user)
      : [];

  const planLabel =
    hasUser
      ? getPlanLabel(AppCore, user)
      : DEFAULT_PLAN_LABEL;

  const avatarColor =
    getSessionAvatarGradient(
      AppCore,
      hasUser ? user : {}
    );

  if (nameEl) {
    try {
      nameEl.textContent =
        displayName;

      setUserDataset(
        nameEl,
        {
          username,
          displayName,
          admin,
          avatarUrl,
          avatarText,
          avatarColor,
          hasUser,
        }
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
        avatarText,
        {
          AppCore,
          user,
        }
      );
    } else {
      renderAvatarFallback(
        avatarEl,
        displayName,
        avatarText,
        {
          AppCore,
          user:
            hasUser ? user : {},
        }
      );
    }

    try {
      setUserDataset(
        avatarEl,
        {
          username,
          displayName,
          admin,
          avatarUrl,
          avatarText,
          avatarColor,
          hasUser,
        }
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

      userToggle.setAttribute(
        "aria-haspopup",
        "menu"
      );

      if (!userToggle.getAttribute("aria-expanded")) {
        userToggle.setAttribute(
          "aria-expanded",
          "false"
        );
      }

      setUserDataset(
        userToggle,
        {
          username,
          displayName,
          admin,
          avatarUrl,
          avatarText,
          avatarColor,
          hasUser,
        }
      );

      removeTooltipAttributes(userToggle);

      const resolvedPlanEl =
        getPlanElement(
          userToggle,
          planEl
        );

      if (resolvedPlanEl) {
        resolvedPlanEl.textContent =
          planLabel;

        setDatasetValue(
          resolvedPlanEl,
          "hasUser",
          hasUser ? "true" : "false"
        );

        removeTooltipAttributes(resolvedPlanEl);
      }
    } catch {}
  } else if (planEl) {
    try {
      planEl.textContent =
        planLabel;

      setDatasetValue(
        planEl,
        "hasUser",
        hasUser ? "true" : "false"
      );

      removeTooltipAttributes(planEl);
    } catch {}
  }

  if (userDropdown) {
    try {
      setUserDataset(
        userDropdown,
        {
          username,
          displayName,
          admin,
          avatarUrl,
          avatarText,
          avatarColor,
          hasUser,
        }
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

  const snapshot =
    buildPublicUserSnapshot(
      {
        user,
        hasUser,
        displayName,
        avatarText,
        avatarUrl,
        avatarColor,
        username,
        planLabel,
        admin,
        roles,
      }
    );

  safeEmit(
    AppCore,
    EVENTS.userRendered,
    snapshot
  );

  return snapshot;
}

/* =========================================================
   DEBUG
========================================================= */

function sanitizeDataset(dataset = {}) {
  const output = {};

  try {
    for (const [key, value] of Object.entries(dataset || {})) {
      output[key] =
        typeof value === "string"
          ? redactSensitiveText(value)
          : value;
    }
  } catch {}

  return output;
}

export function getSidebarUserSnapshot(AppCore) {
  const {
    nameEl,
    avatarEl,
    userToggle,
    userDropdown,
    planEl,
  } =
    getElements(AppCore);

  const user =
    getUser(AppCore);

  const hasUser =
    hasUsableUserIdentity(user);

  const displayName =
    hasUser
      ? getDisplayName(AppCore, user)
      : DEFAULT_DISPLAY_NAME;

  const username =
    hasUser
      ? getUsername(AppCore, user)
      : "";

  const avatarText =
    hasUser
      ? getAvatarText(AppCore, user)
      : DEFAULT_AVATAR_TEXT;

  const avatarUrl =
    hasUser
      ? getAvatarUrl(user)
      : "";

  const avatarColor =
    getSessionAvatarGradient(
      AppCore,
      hasUser ? user : {}
    );

  const roles =
    hasUser
      ? getUserRoles(AppCore, user)
      : [];

  const admin =
    hasUser
      ? isAdmin(AppCore, user)
      : false;

  return sanitizePayload({
    version:
      SIDEBAR_USER_VERSION,

    hasWindow:
      hasWindow(),

    hasUser,

    explicitUnauthenticated:
      isExplicitlyUnauthenticated(AppCore),

    authRestoreInProgress:
      isAuthRestoreInProgress(AppCore),

    hasRuntimeAuthEvidence:
      hasRuntimeAuthEvidence(AppCore),

    hasStoredAuthEvidence:
      hasStoredAuthEvidence(AppCore),

    user:
      buildPublicUserSnapshot(
        {
          user,
          hasUser,
          displayName,
          avatarText,
          avatarUrl,
          avatarColor,
          username,
          planLabel:
            getPlanLabel(AppCore, user),
          admin,
          roles,
        }
      ).user,

    displayName,

    username:
      username || null,

    avatarText,

    avatarUrl:
      avatarUrl
        ? redactSensitiveText(avatarUrl)
        : null,

    avatarUrlHash:
      avatarUrl
        ? hashString(avatarUrl)
        : null,

    avatarColor,

    avatarColorHash:
      avatarColor
        ? hashString(avatarColor)
        : null,

    planLabel:
      getPlanLabel(AppCore, user),

    isAdmin:
      admin,

    roles,

    authSourcesCount:
      getAuthLikeSources(AppCore).length,

    dom: {
      hasName:
        Boolean(nameEl),

      nameText:
        nameEl?.textContent || "",

      nameDataset:
        sanitizeDataset(nameEl?.dataset || {}),

      hasAvatar:
        Boolean(avatarEl),

      avatarClasses:
        avatarEl?.className || "",

      avatarHasImage:
        avatarEl?.dataset?.hasImage || "",

      avatarLoading:
        avatarEl?.dataset?.loading || "",

      avatarError:
        avatarEl?.dataset?.avatarError || "",

      avatarUrl:
        avatarEl?.dataset?.avatarUrl || "",

      avatarUrlHash:
        avatarEl?.dataset?.[AVATAR_URL_HASH_DATASET_KEY] || "",

      avatarText:
        avatarEl?.dataset?.avatarText || "",

      avatarColor:
        avatarEl?.dataset?.avatarColor || "",

      avatarColorHash:
        avatarEl?.dataset?.avatarColorHash || "",

      avatarSeq:
        avatarEl?.dataset?.[AVATAR_RENDER_SEQ_DATASET_KEY] || "",

      hasUserToggle:
        Boolean(userToggle),

      userToggleAriaLabel:
        userToggle?.getAttribute?.("aria-label") || "",

      userToggleAriaExpanded:
        userToggle?.getAttribute?.("aria-expanded") || "",

      userToggleDataset:
        sanitizeDataset(userToggle?.dataset || {}),

      hasUserDropdown:
        Boolean(userDropdown),

      userDropdownAriaHidden:
        userDropdown?.getAttribute?.("aria-hidden") || "",

      userDropdownDataset:
        sanitizeDataset(userDropdown?.dataset || {}),

      hasPlan:
        Boolean(planEl),

      planText:
        planEl?.textContent || "",
    },
  });
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

export default {
  SIDEBAR_USER_VERSION,

  getUser,
  getDisplayName,
  getUsername,
  getAvatarText,
  getAvatarUrl,
  getSessionAvatarGradient,
  getUserRoles,
  isAdmin,

  renderAvatarFallback,
  renderAvatarImage,
  renderUser,

  resetSidebarAvatarColor,
  getSidebarUserSnapshot,
};

/* =========================================================
   Onion SPA - Core HTTP
   Archivo: src/core/http.js

   ONION SUPPORT · CORE HTTP CLIENT
   API.ONIONIT.NET LOCK · AUTH SAFE · REFRESH SAFE · CORS SAFE · 10/10

   RESPONSABILIDADES:
   - Centralizar TODAS las llamadas HTTP del frontend.
   - Apuntar SIEMPRE al backend real por defecto:
       https://api.onionit.net
   - Evitar llamadas accidentales a www.onionsupport.com/api.
   - Soportar cookies cross-origin con credentials: include.
   - Soportar Authorization Bearer si existe token en AppCore/Auth/storage.
   - Soportar refresh mutex.
   - Reintentar /me tras refresh si hay 401.
   - Parsear JSON de forma segura.
   - Detectar HTML accidental como error de endpoint/baseURL.
   - Redactar tokens en errores/logs/eventos.
   - Instalarse en AppCore como:
       AppCore.http
       AppCore.apiClient
       AppCore.services.http
       AppCore.services.api
   - Exponer helpers:
       Http.get()
       Http.post()
       Http.request()
       Http.login()
       Http.me()
       Http.refresh()
       Http.logout()
   - Commit opcional de auth payload en AppCore.state para que SidebarUI pinte user/avatar.
========================================================= */

export const HTTP_VERSION =
  "core-http-v20-api-onionit-net-auth-safe";

export const DEFAULT_API_ORIGIN =
  "https://api.onionit.net";

export const DEFAULT_API_PREFIX =
  "/api";

export const DEFAULT_TIMEOUT_MS =
  30000;

export const DEFAULT_AUTH_TIMEOUT_MS =
  30000;

export const DEFAULT_REFRESH_TIMEOUT_MS =
  30000;

const SOURCE =
  "CoreHTTP";

const AUTH_PATH_RE =
  /^\/api\/auth(?:\/|$)/i;

const REFRESH_PATH_RE =
  /^\/api\/auth\/(?:refresh|token\/refresh|renew)\/?$/i;

const LOGIN_PATH_RE =
  /^\/api\/auth\/(?:login|2fa\/login|mfa\/login|otp\/login)\/?$/i;

const LOGOUT_PATH_RE =
  /^\/api\/auth\/(?:logout|signout|sign-out)\/?$/i;

const TOKEN_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "jwt",
    "idToken",
    "id_token",
  ]);

const REFRESH_TOKEN_KEYS =
  Object.freeze([
    "refreshToken",
    "refresh_token",
  ]);

const USER_KEYS =
  Object.freeze([
    "user",
    "usuario",
    "me",
    "account",
    "profile",
    "currentUser",
    "authUser",
    "sessionUser",
  ]);

const SESSION_KEYS =
  Object.freeze([
    "session",
    "sessionData",
    "authSession",
  ]);

const STORAGE_TOKEN_KEYS =
  Object.freeze([
    "token",
    "accessToken",
    "access_token",
    "authToken",
    "auth_token",
    "jwt",

    "onion_token",
    "onion_access_token",
    "onion:token",
    "onion:accessToken",
    "onion:access_token",
    "onion.token",
    "onion.accessToken",

    "auth_token",
    "auth.accessToken",
    "auth:accessToken",
  ]);

const STORAGE_REFRESH_TOKEN_KEYS =
  Object.freeze([
    "refreshToken",
    "refresh_token",

    "onion_refresh_token",
    "onion:refreshToken",
    "onion:refresh_token",
    "onion.refreshToken",

    "auth.refreshToken",
    "auth:refreshToken",
  ]);

let apiOrigin =
  DEFAULT_API_ORIGIN;

let refreshPromise =
  null;

let installedAppCore =
  null;

const tokenMemory =
  {
    token:
      "",

    refreshToken:
      "",
  };

let tokenProvider =
  null;

let authPayloadCommitter =
  null;

/* =========================================================
   BASICS
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

function isFunction(value) {
  return typeof value === "function";
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isPlainObject(value)
    ? value
    : {};
}

function safeArray(value) {
  return Array.isArray(value)
    ? value
    : [];
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

function safeLower(value, fallback = "") {
  return safeText(value, fallback).toLowerCase();
}

function safeNumber(value, fallback = 0) {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function safeNow() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function safeIsoDate(ms = safeNow()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function wait(ms = 0) {
  return new Promise((resolve) => {
    const delay =
      Math.max(
        0,
        safeNumber(ms, 0)
      );

    try {
      setTimeout(resolve, delay);
    } catch {
      resolve();
    }
  });
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    ),
  ];
}

function hasOwn(object, key) {
  try {
    return Object.prototype.hasOwnProperty.call(
      object,
      key
    );
  } catch {
    return false;
  }
}

function canExtend(value) {
  try {
    return (
      value &&
      typeof value === "object" &&
      Object.isExtensible(value)
    );
  } catch {
    return false;
  }
}

function defineHiddenValue(target, key, value) {
  if (
    !target ||
    !key ||
    !canExtend(target)
  ) {
    return false;
  }

  try {
    Object.defineProperty(
      target,
      key,
      {
        value,
        configurable:
          true,
        enumerable:
          false,
        writable:
          true,
      }
    );

    return true;
  } catch {}

  try {
    target[key] =
      value;

    return true;
  } catch {}

  return false;
}

/* =========================================================
   REDACTION
========================================================= */

export function redactHttpText(value = "") {
  let output =
    safeText(value, "");

  if (!output) {
    return "";
  }

  try {
    output =
      output.replace(
        /([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      );
  } catch {}

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
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      );
  } catch {}

  return output;
}

function sanitizePayload(value, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (typeof value === "string") {
    return redactHttpText(value);
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

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map((item) =>
        sanitizePayload(
          item,
          depth + 1
        )
      );
  }

  if (isPlainObject(value)) {
    const output = {};

    for (const [key, item] of Object.entries(value)) {
      if (/token|secret|password|authorization|credential|jwt|bearer|otp|code/i.test(key)) {
        output[key] =
          item ? "***" : item;

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

/* =========================================================
   EVENTS / LOGS
========================================================= */

function safeEmit(eventName = "", payload = {}) {
  const name =
    safeText(eventName, "");

  if (!name) {
    return false;
  }

  const cleanPayload =
    sanitizePayload({
      source:
        SOURCE,

      version:
        HTTP_VERSION,

      at:
        safeIsoDate(),

      ts:
        safeNow(),

      ...safeObject(payload),
    });

  const AppCore =
    installedAppCore;

  try {
    if (isFunction(AppCore?.events?.emit)) {
      AppCore.events.emit(
        name,
        cleanPayload
      );

      return true;
    }
  } catch {}

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
              cleanPayload,
          }
        )
      );

      return true;
    }
  } catch {}

  return false;
}

function safeWarn(...args) {
  const AppCore =
    installedAppCore;

  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  try {
    if (isFunction(AppCore?.utils?.warn)) {
      AppCore.utils.warn(
        "[CoreHTTP]",
        ...cleanArgs
      );

      return;
    }
  } catch {}

  try {
    console.warn(
      "[CoreHTTP]",
      ...cleanArgs
    );
  } catch {}
}

function safeError(...args) {
  const AppCore =
    installedAppCore;

  const cleanArgs =
    args.map((item) =>
      sanitizePayload(item)
    );

  try {
    if (isFunction(AppCore?.utils?.error)) {
      AppCore.utils.error(
        "[CoreHTTP]",
        ...cleanArgs
      );

      return;
    }
  } catch {}

  try {
    console.error(
      "[CoreHTTP]",
      ...cleanArgs
    );
  } catch {}
}

/* =========================================================
   ORIGIN / URL
========================================================= */

function readImportMetaEnv(key = "") {
  try {
    if (
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env[key]
    ) {
      return import.meta.env[key];
    }
  } catch {}

  return "";
}

function readRuntimeGlobal(key = "") {
  try {
    if (
      hasWindow() &&
      window[key]
    ) {
      return window[key];
    }
  } catch {}

  try {
    if (
      typeof globalThis !== "undefined" &&
      globalThis[key]
    ) {
      return globalThis[key];
    }
  } catch {}

  return "";
}

function normalizeOrigin(value = "", fallback = DEFAULT_API_ORIGIN) {
  const raw =
    safeText(value, "");

  if (!raw) {
    return fallback;
  }

  try {
    const url =
      new URL(raw);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return fallback;
    }

    return url.origin.replace(/\/+$/g, "");
  } catch {
    return fallback;
  }
}

function resolveRuntimeApiOrigin() {
  return normalizeOrigin(
    readRuntimeGlobal("__ONION_API_ORIGIN__") ||
      readRuntimeGlobal("ONION_API_ORIGIN") ||
      readImportMetaEnv("VITE_API_ORIGIN") ||
      readImportMetaEnv("VITE_API_BASE") ||
      readImportMetaEnv("VITE_API_URL") ||
      readImportMetaEnv("PUBLIC_API_ORIGIN") ||
      DEFAULT_API_ORIGIN,
    DEFAULT_API_ORIGIN
  );
}

export function getApiOrigin() {
  return normalizeOrigin(
    apiOrigin,
    DEFAULT_API_ORIGIN
  );
}

export function setApiOrigin(value = "") {
  apiOrigin =
    normalizeOrigin(
      value,
      DEFAULT_API_ORIGIN
    );

  return apiOrigin;
}

function normalizePath(path = "/") {
  let value =
    safeText(path, "/");

  if (!value) {
    value = "/";
  }

  value =
    value.replace(/\\/g, "/");

  if (!value.startsWith("/")) {
    value =
      `/${value}`;
  }

  value =
    value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function ensureApiPath(path = "/", options = {}) {
  const opts =
    safeObject(options);

  let value =
    normalizePath(path);

  if (opts.api === false) {
    return value;
  }

  const apiPrefix =
    safeText(
      opts.apiPrefix,
      DEFAULT_API_PREFIX
    ) || DEFAULT_API_PREFIX;

  const cleanPrefix =
    normalizePath(apiPrefix);

  if (
    value === cleanPrefix ||
    value.startsWith(`${cleanPrefix}/`)
  ) {
    return value;
  }

  return `${cleanPrefix}${value}`;
}

function appendQuery(url, query = null) {
  if (!query) {
    return url;
  }

  try {
    const parsed =
      new URL(url);

    if (query instanceof URLSearchParams) {
      for (const [key, value] of query.entries()) {
        parsed.searchParams.set(
          key,
          value
        );
      }

      return parsed.toString();
    }

    if (isPlainObject(query)) {
      for (const [key, value] of Object.entries(query)) {
        if (
          value === undefined ||
          value === null ||
          value === ""
        ) {
          continue;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            parsed.searchParams.append(
              key,
              String(item)
            );
          }

          continue;
        }

        parsed.searchParams.set(
          key,
          String(value)
        );
      }

      return parsed.toString();
    }
  } catch {}

  return url;
}

export function buildApiUrl(endpoint = "/", options = {}) {
  const opts =
    safeObject(options);

  const raw =
    safeText(endpoint, "/");

  if (/^https?:\/\//i.test(raw)) {
    return appendQuery(
      raw,
      opts.query
    );
  }

  if (raw.startsWith("//")) {
    return appendQuery(
      `${getApiOrigin()}${normalizePath(raw.replace(/^\/+/, ""))}`,
      opts.query
    );
  }

  const path =
    ensureApiPath(
      raw,
      opts
    );

  const origin =
    normalizeOrigin(
      opts.origin ||
        opts.baseURL ||
        opts.baseUrl ||
        getApiOrigin(),
      DEFAULT_API_ORIGIN
    );

  return appendQuery(
    `${origin}${path}`,
    opts.query
  );
}

function getUrlPathname(url = "") {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return normalizePath(url);
  }
}

/* =========================================================
   REQUEST ID
========================================================= */

function createRequestId() {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto.randomUUID();
    }
  } catch {}

  return `spa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/* =========================================================
   TOKENS
========================================================= */

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
      window.sessionStorage?.getItem?.(cleanKey);

    if (value) {
      return safeText(value, "");
    }
  } catch {}

  try {
    const value =
      window.localStorage?.getItem?.(cleanKey);

    if (value) {
      return safeText(value, "");
    }
  } catch {}

  return "";
}

function writeStorageValue(key = "", value = "") {
  if (!isBrowser()) {
    return false;
  }

  const cleanKey =
    safeText(key, "");

  if (!cleanKey) {
    return false;
  }

  try {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      window.sessionStorage?.removeItem?.(cleanKey);
      return true;
    }

    window.sessionStorage?.setItem?.(
      cleanKey,
      String(value)
    );

    return true;
  } catch {}

  return false;
}

function removeStorageValue(key = "") {
  if (!isBrowser()) {
    return false;
  }

  try {
    window.sessionStorage?.removeItem?.(key);
  } catch {}

  try {
    window.localStorage?.removeItem?.(key);
  } catch {}

  return true;
}

function readFirstStorage(keys = []) {
  for (const key of safeArray(keys)) {
    const value =
      readStorageValue(key);

    if (value) {
      return value;
    }
  }

  return "";
}

function getTokenFromAppCore() {
  const state =
    safeObject(installedAppCore?.state);

  const session =
    safeObject(state.session || state.sessionData);

  return safeText(
    state.token ||
      state.accessToken ||
      state.access_token ||
      state.authToken ||
      state.auth_token ||
      session.token ||
      session.accessToken ||
      session.access_token ||
      installedAppCore?.token ||
      "",
    ""
  );
}

function getRefreshTokenFromAppCore() {
  const state =
    safeObject(installedAppCore?.state);

  const session =
    safeObject(state.session || state.sessionData);

  return safeText(
    state.refreshToken ||
      state.refresh_token ||
      session.refreshToken ||
      session.refresh_token ||
      installedAppCore?.refreshToken ||
      "",
    ""
  );
}

export function setTokenProvider(provider) {
  tokenProvider =
    isFunction(provider)
      ? provider
      : null;

  return true;
}

export function getAccessToken(options = {}) {
  const opts =
    safeObject(options);

  try {
    if (isFunction(tokenProvider)) {
      const value =
        safeText(
          tokenProvider(),
          ""
        );

      if (value) {
        return value;
      }
    }
  } catch {}

  const fromAppCore =
    getTokenFromAppCore();

  if (fromAppCore) {
    return fromAppCore;
  }

  if (tokenMemory.token) {
    return tokenMemory.token;
  }

  if (opts.allowStorageTokens === true) {
    return readFirstStorage(
      STORAGE_TOKEN_KEYS
    );
  }

  return "";
}

export function getRefreshToken(options = {}) {
  const opts =
    safeObject(options);

  const fromAppCore =
    getRefreshTokenFromAppCore();

  if (fromAppCore) {
    return fromAppCore;
  }

  if (tokenMemory.refreshToken) {
    return tokenMemory.refreshToken;
  }

  if (opts.allowStorageTokens === true) {
    return readFirstStorage(
      STORAGE_REFRESH_TOKEN_KEYS
    );
  }

  return "";
}

export function setAuthTokens({
  token = "",
  accessToken = "",
  access_token = "",
  refreshToken = "",
  refresh_token = "",
  persist = false,
} = {}) {
  const nextToken =
    safeText(
      token ||
        accessToken ||
        access_token,
      ""
    );

  const nextRefresh =
    safeText(
      refreshToken ||
        refresh_token,
      ""
    );

  if (nextToken) {
    tokenMemory.token =
      nextToken;
  }

  if (nextRefresh) {
    tokenMemory.refreshToken =
      nextRefresh;
  }

  if (persist === true) {
    if (nextToken) {
      writeStorageValue(
        "onion_access_token",
        nextToken
      );
    }

    if (nextRefresh) {
      writeStorageValue(
        "onion_refresh_token",
        nextRefresh
      );
    }
  }

  return {
    token:
      tokenMemory.token,

    refreshToken:
      tokenMemory.refreshToken,
  };
}

export function clearAuthTokens({
  storage = true,
} = {}) {
  tokenMemory.token =
    "";

  tokenMemory.refreshToken =
    "";

  if (storage) {
    [
      ...STORAGE_TOKEN_KEYS,
      ...STORAGE_REFRESH_TOKEN_KEYS,
    ].forEach((key) => {
      removeStorageValue(key);
    });
  }

  return true;
}

/* =========================================================
   PAYLOAD EXTRACTION
========================================================= */

function collectObjects(value, depth = 0, seen = new WeakSet()) {
  if (
    depth > 5 ||
    !value ||
    typeof value !== "object"
  ) {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }

  seen.add(value);

  const output =
    [value];

  for (const key of [
    "data",
    "payload",
    "result",
    "body",
    "response",
    "auth",
    "session",
    "sessionData",
    "account",
    "profile",
    "me",
  ]) {
    const child =
      value[key];

    if (
      child &&
      typeof child === "object"
    ) {
      output.push(
        ...collectObjects(
          child,
          depth + 1,
          seen
        )
      );
    }
  }

  return output;
}

function pickFirstTextFromObjects(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    for (const key of safeArray(keys)) {
      const value =
        safeText(
          object?.[key],
          ""
        );

      if (value) {
        return value;
      }
    }
  }

  return "";
}

function pickFirstObjectFromObjects(objects = [], keys = []) {
  for (const object of safeArray(objects)) {
    for (const key of safeArray(keys)) {
      if (isPlainObject(object?.[key])) {
        return object[key];
      }
    }
  }

  return null;
}

function extractTokens(payload = {}) {
  const objects =
    collectObjects(payload);

  return {
    token:
      pickFirstTextFromObjects(
        objects,
        TOKEN_KEYS
      ),

    refreshToken:
      pickFirstTextFromObjects(
        objects,
        REFRESH_TOKEN_KEYS
      ),
  };
}

function getProfileBranches(user = {}) {
  const current =
    safeObject(user);

  return [
    current,
    safeObject(current.user),
    safeObject(current.usuario),
    safeObject(current.profile),
    safeObject(current.account),
    safeObject(current.me),
    safeObject(current.raw),
    safeObject(current.raw?.user),
    safeObject(current.raw?.profile),
    safeObject(current.data),
    safeObject(current.data?.user),
  ].filter((item) =>
    item &&
    typeof item === "object" &&
    Object.keys(item).length > 0
  );
}

function hasUsableUser(user = null) {
  const current =
    safeObject(user);

  if (!Object.keys(current).length) {
    return false;
  }

  return getProfileBranches(current).some((branch) => {
    return Boolean(
      safeText(branch.id, "") ||
        safeText(branch.userId, "") ||
        safeText(branch.user_id, "") ||
        safeText(branch.uid, "") ||
        safeText(branch.sub, "") ||
        safeText(branch._id, "") ||
        safeText(branch.username, "") ||
        safeText(branch.userName, "") ||
        safeText(branch.user_name, "") ||
        safeText(branch.email, "") ||
        safeText(branch.mail, "") ||
        safeText(branch.phone, "") ||
        safeText(branch.telefono, "") ||
        safeText(branch.name, "") ||
        safeText(branch.displayName, "") ||
        safeText(branch.fullName, "")
    );
  });
}

function extractUser(payload = {}) {
  const objects =
    collectObjects(payload);

  const direct =
    pickFirstObjectFromObjects(
      objects,
      USER_KEYS
    );

  if (hasUsableUser(direct)) {
    return direct;
  }

  for (const object of objects) {
    if (hasUsableUser(object)) {
      return object;
    }
  }

  return null;
}

function extractSession(payload = {}) {
  const objects =
    collectObjects(payload);

  return (
    pickFirstObjectFromObjects(
      objects,
      SESSION_KEYS
    ) ||
    null
  );
}

function resolveRoleFromPayload(payload = {}, user = null) {
  const objects =
    collectObjects(payload);

  return safeLower(
    pickFirstTextFromObjects(
      objects,
      [
        "role",
        "rol",
        "userRole",
        "user_role",
        "type",
        "tipo",
      ]
    ) ||
      user?.role ||
      user?.rol ||
      "user",
    "user"
  );
}

function resolveAvatar(user = {}) {
  const branches =
    getProfileBranches(user);

  for (const branch of branches) {
    const avatar =
      safeText(
        branch.avatar ||
          branch.avatarUrl ||
          branch.avatar_url ||
          branch.photo ||
          branch.photoUrl ||
          branch.photo_url ||
          branch.image ||
          branch.imageUrl ||
          branch.image_url ||
          branch.profileImage ||
          branch.profile_image ||
          branch.picture ||
          branch.pictureUrl ||
          branch.picture_url ||
          "",
        ""
      );

    if (avatar) {
      return avatar;
    }
  }

  return "";
}

function normalizeUsername(value = "") {
  return safeText(value, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .toLowerCase();
}

function normalizeUserForClient(user = {}, role = "user") {
  const source =
    safeObject(user);

  if (!hasUsableUser(source)) {
    return null;
  }

  const userId =
    safeText(
      source.userId ||
        source.user_id ||
        source.uid ||
        source.sub ||
        source.id ||
        source._id ||
        "",
      ""
    );

  const email =
    safeText(
      source.email ||
        source.mail ||
        "",
      ""
    );

  const username =
    safeText(
      source.username ||
        source.userName ||
        source.user_name ||
        source.usernameLower ||
        source.username_lower ||
        source.slug ||
        "",
      ""
    );

  const usernameLower =
    normalizeUsername(
      source.usernameLower ||
        source.username_lower ||
        username ||
        email ||
        userId
    );

  const slug =
    normalizeUsername(
      source.slug ||
        usernameLower ||
        username ||
        email ||
        userId
    );

  const displayName =
    safeText(
      source.displayName ||
        source.fullName ||
        source.name ||
        source.nombre ||
        username ||
        email ||
        "Usuario",
      "Usuario"
    );

  const finalRole =
    safeLower(
      role ||
        source.role ||
        source.rol ||
        "user",
      "user"
    );

  const avatar =
    resolveAvatar(source);

  return {
    ...source,

    id:
      source.id ||
      userId ||
      null,

    userId:
      source.userId ||
      userId ||
      null,

    uid:
      source.uid ||
      userId ||
      null,

    sub:
      source.sub ||
      userId ||
      null,

    email:
      email || null,

    emailLower:
      source.emailLower ||
      source.email_lower ||
      (email ? email.toLowerCase() : null),

    username:
      username || usernameLower || null,

    usernameLower:
      usernameLower || null,

    username_lower:
      source.username_lower ||
      usernameLower ||
      null,

    slug:
      slug || null,

    name:
      displayName,

    nombre:
      source.nombre ||
      displayName,

    displayName,

    fullName:
      source.fullName ||
      displayName,

    role:
      finalRole,

    rol:
      finalRole,

    roles:
      unique([
        finalRole,
        ...safeArray(source.roles),
      ]),

    permissions:
      safeArray(
        source.permissions ||
          source.permisos
      ),

    permisos:
      safeArray(
        source.permisos ||
          source.permissions
      ),

    avatar:
      avatar || null,

    avatarUrl:
      avatar || null,

    picture:
      avatar || null,

    hasAvatar:
      source.hasAvatar === true ||
      source.has_avatar === true ||
      Boolean(avatar),
  };
}

/* =========================================================
   APPCORE AUTH COMMIT
========================================================= */

export function setAuthPayloadCommitter(fn) {
  authPayloadCommitter =
    isFunction(fn)
      ? fn
      : null;

  return true;
}

function commitAuthPayloadToCore(AppCore, payload = {}, meta = {}) {
  if (!AppCore) {
    return false;
  }

  const data =
    safeObject(payload);

  const tokens =
    extractTokens(data);

  if (
    tokens.token ||
    tokens.refreshToken
  ) {
    setAuthTokens({
      token:
        tokens.token,

      refreshToken:
        tokens.refreshToken,
    });
  }

  const rawUser =
    extractUser(data);

  const session =
    extractSession(data);

  const role =
    resolveRoleFromPayload(
      data,
      rawUser
    );

  const user =
    normalizeUserForClient(
      rawUser,
      role
    );

  const authenticated =
    data.authenticated === true ||
    data.ok === true ||
    data.success === true ||
    safeObject(data.data).authenticated === true ||
    safeObject(data.auth).authenticated === true ||
    Boolean(user);

  const patch =
    {};

  if (tokens.token) {
    patch.token =
      tokens.token;

    patch.accessToken =
      tokens.token;

    patch.access_token =
      tokens.token;

    patch.hasToken =
      true;
  }

  if (tokens.refreshToken) {
    patch.refreshToken =
      tokens.refreshToken;

    patch.refresh_token =
      tokens.refreshToken;
  }

  if (session) {
    patch.session =
      session;

    patch.sessionData =
      session;

    patch.sessionId =
      session.sessionId ||
      session.session_id ||
      session.sid ||
      AppCore?.state?.sessionId ||
      null;

    patch.sessionUserId =
      session.sessionUserId ||
      session.session_user_id ||
      session.userId ||
      session.user_id ||
      user?.userId ||
      user?.id ||
      AppCore?.state?.sessionUserId ||
      null;
  }

  if (user) {
    patch.user =
      user;

    patch.currentUser =
      user;

    patch.authUser =
      user;

    patch.sessionUser =
      user;

    patch.role =
      role;

    patch.rol =
      role;

    patch.userRole =
      role;

    patch.roles =
      unique([
        role,
        ...safeArray(user.roles),
      ]);

    patch.currentResolvedUsername =
      user.slug ||
      user.usernameLower ||
      user.username ||
      AppCore?.state?.currentResolvedUsername ||
      null;

    patch.resolvedUsername =
      user.slug ||
      user.usernameLower ||
      user.username ||
      AppCore?.state?.resolvedUsername ||
      null;

    patch.authenticated =
      Boolean(authenticated);

    patch.lastAuthSource =
      safeText(
        meta.source,
        SOURCE
      );

    patch.lastMeAt =
      meta.endpoint &&
      /\/auth\/(?:me|session|profile|whoami|current)\b/i.test(meta.endpoint)
        ? safeIsoDate()
        : AppCore?.state?.lastMeAt || null;
  }

  if (!Object.keys(patch).length) {
    return false;
  }

  try {
    if (
      AppCore.state &&
      typeof AppCore.state === "object"
    ) {
      Object.assign(
        AppCore.state,
        patch
      );
    }
  } catch {}

  try {
    AppCore.setState?.(
      patch,
      {
        source:
          "core:http:auth-payload",
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );
  } catch {}

  try {
    AppCore.patchState?.(
      patch,
      {
        source:
          "core:http:auth-payload",
        emit:
          false,
        emitState:
          false,
        silent:
          true,
      }
    );
  } catch {}

  if (user && meta.emit !== false) {
    try {
      AppCore.events?.emit?.(
        "app:user:change",
        sanitizePayload({
          source:
            "core:http",

          reason:
            safeText(
              meta.reason,
              "auth-payload"
            ),

          user,

          role,

          authenticated:
            Boolean(authenticated),
        })
      );
    } catch {}

    try {
      AppCore.events?.emit?.(
        "app:auth:ready",
        sanitizePayload({
          source:
            "core:http",

          reason:
            safeText(
              meta.reason,
              "auth-payload"
            ),

          user,

          role,

          authenticated:
            Boolean(authenticated),
        })
      );
    } catch {}
  }

  return true;
}

function handleAuthPayload(payload = {}, meta = {}) {
  const tokens =
    extractTokens(payload);

  if (
    tokens.token ||
    tokens.refreshToken
  ) {
    setAuthTokens({
      token:
        tokens.token,

      refreshToken:
        tokens.refreshToken,
      persist:
        meta.persistTokens === true,
    });
  }

  try {
    if (isFunction(authPayloadCommitter)) {
      authPayloadCommitter(
        payload,
        meta
      );
    }
  } catch {}

  try {
    commitAuthPayloadToCore(
      installedAppCore,
      payload,
      meta
    );
  } catch {}

  return payload;
}

/* =========================================================
   ERRORS
========================================================= */

export class HttpError extends Error {
  constructor(message = "HTTP_ERROR", options = {}) {
    super(message);

    this.name =
      "HttpError";

    this.status =
      options.status || 0;

    this.statusCode =
      options.status || 0;

    this.code =
      options.code || "HTTP_ERROR";

    this.method =
      options.method || "";

    this.url =
      redactHttpText(options.url || "");

    this.path =
      options.path || "";

    this.requestId =
      options.requestId || "";

    this.data =
      options.data ?? null;

    this.rawText =
      redactHttpText(options.rawText || "");

    this.headers =
      options.headers || {};

    this.retriable =
      Boolean(options.retriable);

    this.timeout =
      Boolean(options.timeout);

    this.network =
      Boolean(options.network);

    this.at =
      safeIsoDate();
  }
}

function headersToObject(headers) {
  const output = {};

  try {
    headers?.forEach?.((value, key) => {
      output[key] =
        value;
    });
  } catch {}

  return output;
}

function getResponseRequestId(response) {
  try {
    return (
      response.headers.get("x-request-id") ||
      response.headers.get("x-correlation-id") ||
      response.headers.get("x-auth-request-id") ||
      ""
    );
  } catch {
    return "";
  }
}

function getPayloadCode(payload = {}, fallback = "HTTP_ERROR") {
  return safeText(
    payload?.code ||
      payload?.error ||
      payload?.status ||
      fallback,
    fallback
  );
}

function getPayloadMessage(payload = {}, fallback = "Error HTTP.") {
  return safeText(
    payload?.message ||
      payload?.errorMessage ||
      payload?.detail ||
      payload?.description ||
      payload?.error ||
      fallback,
    fallback
  );
}

async function readResponse(response, options = {}) {
  const opts =
    safeObject(options);

  const responseType =
    safeText(
      opts.responseType,
      "json"
    );

  if (responseType === "raw") {
    return {
      data:
        response,

      text:
        "",

      json:
        false,
    };
  }

  if (responseType === "blob") {
    try {
      return {
        data:
          await response.blob(),

        text:
          "",

        json:
          false,
      };
    } catch {
      return {
        data:
          null,

        text:
          "",

        json:
          false,
      };
    }
  }

  if (responseType === "arrayBuffer") {
    try {
      return {
        data:
          await response.arrayBuffer(),

        text:
          "",

        json:
          false,
      };
    } catch {
      return {
        data:
          null,

        text:
          "",

        json:
          false,
      };
    }
  }

  let text =
    "";

  try {
    text =
      await response.text();
  } catch {
    text =
      "";
  }

  if (!text) {
    return {
      data:
        null,

      text:
        "",

      json:
        false,
    };
  }

  const contentType =
    safeLower(
      response.headers?.get?.("content-type") || "",
      ""
    );

  const looksJson =
    contentType.includes("application/json") ||
    contentType.includes("+json") ||
    /^[\s]*[\[{]/.test(text);

  if (
    responseType === "text" ||
    (
      opts.expectJson === false &&
      !looksJson
    )
  ) {
    return {
      data:
        text,

      text,

      json:
        false,
    };
  }

  if (looksJson) {
    try {
      return {
        data:
          JSON.parse(text),

        text,

        json:
          true,
      };
    } catch (error) {
      throw new HttpError(
        "La API devolvió una respuesta JSON inválida.",
        {
          status:
            response.status,

          code:
            "INVALID_JSON_RESPONSE",

          method:
            opts.method,

          url:
            opts.url,

          path:
            opts.path,

          requestId:
            getResponseRequestId(response),

          rawText:
            text.slice(0, 300),
        }
      );
    }
  }

  if (response.ok && opts.expectJson === true) {
    throw new HttpError(
      "La API no devolvió JSON. Revisa la baseURL del frontend.",
      {
        status:
          response.status,

        code:
          "NON_JSON_RESPONSE",

        method:
          opts.method,

        url:
          opts.url,

        path:
          opts.path,

        requestId:
          getResponseRequestId(response),

        rawText:
          text.slice(0, 300),
      }
    );
  }

  return {
    data:
      text,

    text,

    json:
      false,
  };
}

/* =========================================================
   BODY / HEADERS
========================================================= */

function isFormData(value) {
  try {
    return (
      typeof FormData !== "undefined" &&
      value instanceof FormData
    );
  } catch {
    return false;
  }
}

function isBlob(value) {
  try {
    return (
      typeof Blob !== "undefined" &&
      value instanceof Blob
    );
  } catch {
    return false;
  }
}

function normalizeHeaders(headers = {}) {
  if (headers instanceof Headers) {
    const output = {};

    try {
      headers.forEach((value, key) => {
        output[key] =
          value;
      });
    } catch {}

    return output;
  }

  return {
    ...safeObject(headers),
  };
}

function hasHeader(headers = {}, name = "") {
  const needle =
    safeLower(name, "");

  return Object.keys(headers).some((key) =>
    safeLower(key, "") === needle
  );
}

function buildHeaders({
  headers = {},
  method = "GET",
  body = undefined,
  auth = true,
  noAuthHeader = false,
  requestId = "",
  allowStorageTokens = true,
} = {}) {
  const finalHeaders =
    normalizeHeaders(headers);

  if (!hasHeader(finalHeaders, "Accept")) {
    finalHeaders.Accept =
      "application/json";
  }

  if (!hasHeader(finalHeaders, "X-Request-Id")) {
    finalHeaders["X-Request-Id"] =
      requestId || createRequestId();
  }

  if (!hasHeader(finalHeaders, "X-Onion-Client")) {
    finalHeaders["X-Onion-Client"] =
      "onion-spa";
  }

  if (!hasHeader(finalHeaders, "X-Onion-HTTP-Version")) {
    finalHeaders["X-Onion-HTTP-Version"] =
      HTTP_VERSION;
  }

  const shouldSetJson =
    body !== undefined &&
    body !== null &&
    !isFormData(body) &&
    !isBlob(body) &&
    typeof body !== "string" &&
    !hasHeader(finalHeaders, "Content-Type");

  if (shouldSetJson) {
    finalHeaders["Content-Type"] =
      "application/json";
  }

  if (
    auth !== false &&
    noAuthHeader !== true &&
    !hasHeader(finalHeaders, "Authorization")
  ) {
    const token =
      getAccessToken({
        allowStorageTokens,
      });

    if (token) {
      finalHeaders.Authorization =
        token.startsWith("Bearer ")
          ? token
          : `Bearer ${token}`;
    }
  }

  return finalHeaders;
}

function buildBody(body = undefined) {
  if (
    body === undefined ||
    body === null
  ) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    isFormData(body) ||
    isBlob(body)
  ) {
    return body;
  }

  try {
    return JSON.stringify(body);
  } catch {
    return JSON.stringify({});
  }
}

/* =========================================================
   ABORT / TIMEOUT
========================================================= */

function createAbortContext(options = {}) {
  const opts =
    safeObject(options);

  const timeoutMs =
    safeNumber(
      opts.timeoutMs,
      DEFAULT_TIMEOUT_MS
    );

  if (
    typeof AbortController === "undefined"
  ) {
    return {
      signal:
        opts.signal || undefined,

      cleanup:
        () => {},
    };
  }

  const controller =
    new AbortController();

  let timer =
    null;

  const onExternalAbort =
    () => {
      try {
        controller.abort(
          opts.signal?.reason ||
            "external-abort"
        );
      } catch {
        try {
          controller.abort();
        } catch {}
      }
    };

  if (opts.signal) {
    try {
      if (opts.signal.aborted) {
        onExternalAbort();
      } else {
        opts.signal.addEventListener(
          "abort",
          onExternalAbort,
          {
            once:
              true,
          }
        );
      }
    } catch {}
  }

  if (timeoutMs > 0) {
    try {
      timer =
        setTimeout(() => {
          try {
            controller.abort(
              "request-timeout"
            );
          } catch {
            try {
              controller.abort();
            } catch {}
          }
        }, timeoutMs);
    } catch {}
  }

  return {
    signal:
      controller.signal,

    cleanup:
      () => {
        try {
          if (timer) {
            clearTimeout(timer);
          }
        } catch {}

        try {
          opts.signal?.removeEventListener?.(
            "abort",
            onExternalAbort
          );
        } catch {}
      },
  };
}

/* =========================================================
   RETRY
========================================================= */

function isRetryableStatus(status = 0) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function methodAllowsRetry(method = "GET", options = {}) {
  const cleanMethod =
    safeText(method, "GET").toUpperCase();

  if (options.retryUnsafe === true) {
    return true;
  }

  return [
    "GET",
    "HEAD",
    "OPTIONS",
  ].includes(cleanMethod);
}

function defaultRetriesFor(method = "GET") {
  return methodAllowsRetry(method)
    ? 1
    : 0;
}

function getRetryDelayMs(attempt = 0, options = {}) {
  const base =
    safeNumber(
      options.retryDelayMs,
      250
    );

  return Math.min(
    3000,
    base * Math.max(1, attempt + 1)
  );
}

/* =========================================================
   LOW LEVEL REQUEST
========================================================= */

async function performRequest(endpoint = "/", options = {}) {
  const opts =
    safeObject(options);

  const method =
    safeText(
      opts.method,
      "GET"
    ).toUpperCase();

  const url =
    buildApiUrl(
      endpoint,
      opts
    );

  const path =
    getUrlPathname(url);

  const requestId =
    safeText(
      opts.requestId,
      createRequestId()
    );

  const retries =
    Number.isFinite(Number(opts.retries))
      ? Math.max(0, Number(opts.retries))
      : defaultRetriesFor(method);

  const timeoutMs =
    safeNumber(
      opts.timeoutMs,
      AUTH_PATH_RE.test(path)
        ? DEFAULT_AUTH_TIMEOUT_MS
        : DEFAULT_TIMEOUT_MS
    );

  const fetchBody =
    [
      "GET",
      "HEAD",
    ].includes(method)
      ? undefined
      : buildBody(
          opts.body !== undefined
            ? opts.body
            : opts.data
        );

  const headers =
    buildHeaders({
      headers:
        opts.headers,

      method,

      body:
        opts.body !== undefined
          ? opts.body
          : opts.data,

      auth:
        opts.auth,

      noAuthHeader:
        opts.noAuthHeader,

      requestId,

      allowStorageTokens:
        opts.allowStorageTokens !== false,
    });

  let lastError =
    null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const abortCtx =
      createAbortContext({
        ...opts,
        timeoutMs,
      });

    try {
      safeEmit(
        "http:request:start",
        {
          method,
          url:
            redactHttpText(url),
          path,
          attempt,
          requestId,
        }
      );

      const response =
        await fetch(
          url,
          {
            method,
            headers,
            body:
              fetchBody,

            credentials:
              opts.credentials === "omit"
                ? "omit"
                : "include",

            mode:
              opts.mode || "cors",

            cache:
              opts.cache ||
              (
                AUTH_PATH_RE.test(path)
                  ? "no-store"
                  : "no-cache"
              ),

            redirect:
              opts.redirect || "follow",

            signal:
              abortCtx.signal,
          }
        );

      const parsed =
        await readResponse(
          response,
          {
            ...opts,
            method,
            url,
            path,
            expectJson:
              opts.expectJson !== false,
          }
        );

      if (!response.ok) {
        const data =
          isPlainObject(parsed.data)
            ? parsed.data
            : {};

        const error =
          new HttpError(
            getPayloadMessage(
              data,
              `HTTP ${response.status}`
            ),
            {
              status:
                response.status,

              code:
                getPayloadCode(
                  data,
                  response.status === 401
                    ? "UNAUTHORIZED"
                    : "HTTP_ERROR"
                ),

              method,
              url,
              path,
              requestId:
                getResponseRequestId(response) ||
                requestId,

              data:
                parsed.data,

              rawText:
                parsed.text,

              headers:
                headersToObject(response.headers),

              retriable:
                isRetryableStatus(response.status),
            }
          );

        if (
          attempt < retries &&
          methodAllowsRetry(method, opts) &&
          isRetryableStatus(response.status)
        ) {
          lastError =
            error;

          await wait(
            getRetryDelayMs(
              attempt,
              opts
            )
          );

          continue;
        }

        throw error;
      }

      const data =
        parsed.data;

      if (
        opts.captureAuth !== false &&
        AUTH_PATH_RE.test(path) &&
        isPlainObject(data)
      ) {
        handleAuthPayload(
          data,
          {
            endpoint:
              path,

            method,

            requestId,

            source:
              "core:http",

            reason:
              path.includes("/me")
                ? "me"
                : path.includes("/login")
                  ? "login"
                  : path.includes("/refresh")
                    ? "refresh"
                    : "auth-response",

            persistTokens:
              opts.persistTokens === true,

            emit:
              opts.emitAuthEvents !== false,
          }
        );
      }

      safeEmit(
        "http:request:success",
        {
          method,
          path,
          status:
            response.status,
          attempt,
          requestId:
            getResponseRequestId(response) ||
            requestId,
        }
      );

      return data;
    } catch (error) {
      const aborted =
        error?.name === "AbortError" ||
        String(error?.message || "").includes("abort") ||
        String(error || "").includes("request-timeout");

      const networkError =
        error instanceof TypeError ||
        error?.network === true;

      const normalized =
        error instanceof HttpError
          ? error
          : new HttpError(
              aborted
                ? "La solicitud ha excedido el tiempo máximo."
                : "No se pudo contactar con la API.",
              {
                status:
                  0,

                code:
                  aborted
                    ? "REQUEST_TIMEOUT"
                    : "NETWORK_ERROR",

                method,
                url,
                path,
                requestId,
                network:
                  networkError,
                timeout:
                  aborted,
                retriable:
                  true,
              }
            );

      lastError =
        normalized;

      if (
        attempt < retries &&
        methodAllowsRetry(method, opts) &&
        (
          normalized.network ||
          normalized.timeout ||
          normalized.retriable
        )
      ) {
        await wait(
          getRetryDelayMs(
            attempt,
            opts
          )
        );

        continue;
      }

      safeEmit(
        "http:request:error",
        {
          method,
          path,
          requestId,
          error:
            normalized,
        }
      );

      throw normalized;
    } finally {
      abortCtx.cleanup();
    }
  }

  throw lastError ||
    new HttpError(
      "No se pudo completar la solicitud.",
      {
        code:
          "REQUEST_FAILED",
      }
    );
}

/* =========================================================
   REFRESH
========================================================= */

function shouldAttemptRefresh(error, endpoint = "", options = {}) {
  const opts =
    safeObject(options);

  if (opts.skipRefresh === true) {
    return false;
  }

  if (opts.auth === false) {
    return false;
  }

  if (!(error instanceof HttpError)) {
    return false;
  }

  if (
    error.status !== 401 &&
    error.status !== 419
  ) {
    return false;
  }

  const path =
    getUrlPathname(
      buildApiUrl(
        endpoint,
        opts
      )
    );

  if (
    REFRESH_PATH_RE.test(path) ||
    LOGIN_PATH_RE.test(path) ||
    LOGOUT_PATH_RE.test(path)
  ) {
    return false;
  }

  return true;
}

export async function refreshSession(options = {}) {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise =
    (async () => {
      const refreshToken =
        getRefreshToken({
          allowStorageTokens:
            true,
        });

      const body =
        refreshToken
          ? {
              refreshToken,
              refresh_token:
                refreshToken,
            }
          : undefined;

      const result =
        await performRequest(
          "/auth/refresh",
          {
            method:
              "POST",

            body,

            auth:
              false,

            noAuthHeader:
              true,

            skipRefresh:
              true,

            timeoutMs:
              safeNumber(
                options.timeoutMs,
                DEFAULT_REFRESH_TIMEOUT_MS
              ),

            retries:
              0,

            captureAuth:
              true,

            persistTokens:
              options.persistTokens === true,

            reason:
              "refresh-session",
          }
        );

      handleAuthPayload(
        result,
        {
          endpoint:
            "/api/auth/refresh",

          method:
            "POST",

          reason:
            "refresh-session",

          source:
            "core:http",

          emit:
            options.emitAuthEvents !== false,
        }
      );

      return result;
    })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise =
      null;
  }
}

/* =========================================================
   PUBLIC REQUEST API
========================================================= */

export async function request(firstArg = "/", secondArg = {}, thirdArg = {}) {
  /*
    Compat:
    - request("/auth/me", { method: "GET" })
    - request("GET", "/auth/me", options)
    - request("POST", "/auth/login", { body })
  */

  let endpoint =
    firstArg;

  let options =
    safeObject(secondArg);

  if (
    typeof firstArg === "string" &&
    /^[A-Z]+$/i.test(firstArg) &&
    typeof secondArg === "string"
  ) {
    endpoint =
      secondArg;

    options =
      {
        ...safeObject(thirdArg),
        method:
          firstArg.toUpperCase(),
      };
  }

  try {
    return await performRequest(
      endpoint,
      options
    );
  } catch (error) {
    if (
      shouldAttemptRefresh(
        error,
        endpoint,
        options
      )
    ) {
      try {
        await refreshSession({
          emitAuthEvents:
            options.emitAuthEvents,
        });

        return await performRequest(
          endpoint,
          {
            ...options,
            skipRefresh:
              true,
            retries:
              0,
          }
        );
      } catch (refreshError) {
        safeWarn(
          "Refresh falló; limpiando tokens.",
          refreshError
        );

        clearAuthTokens({
          storage:
            false,
        });

        throw error;
      }
    }

    throw error;
  }
}

export function get(endpoint = "/", options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "GET",
    }
  );
}

export function post(endpoint = "/", body = undefined, options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "POST",
      body,
    }
  );
}

export function put(endpoint = "/", body = undefined, options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "PUT",
      body,
    }
  );
}

export function patch(endpoint = "/", body = undefined, options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "PATCH",
      body,
    }
  );
}

export function del(endpoint = "/", options = {}) {
  return request(
    endpoint,
    {
      ...safeObject(options),
      method:
        "DELETE",
    }
  );
}

/* =========================================================
   AUTH API
========================================================= */

export function login(credentials = {}, options = {}) {
  return post(
    "/auth/login",
    credentials,
    {
      auth:
        false,
      noAuthHeader:
        true,
      retries:
        0,
      timeoutMs:
        DEFAULT_AUTH_TIMEOUT_MS,
      captureAuth:
        true,
      persistTokens:
        options.persistTokens === true,
      ...safeObject(options),
    }
  );
}

export function me(options = {}) {
  return get(
    "/auth/me",
    {
      auth:
        true,
      timeoutMs:
        DEFAULT_AUTH_TIMEOUT_MS,
      captureAuth:
        true,
      retries:
        0,
      cache:
        "no-store",
      ...safeObject(options),
    }
  );
}

export function logout(options = {}) {
  return post(
    "/auth/logout",
    {},
    {
      auth:
        true,
      timeoutMs:
        DEFAULT_AUTH_TIMEOUT_MS,
      retries:
        0,
      skipRefresh:
        true,
      ...safeObject(options),
    }
  ).finally(() => {
    clearAuthTokens({
      storage:
        options.clearStorage !== false,
    });
  });
}

export function refresh(options = {}) {
  return refreshSession(options);
}

/* =========================================================
   APPCORE INSTALL
========================================================= */

function configureAppCoreOrigin(AppCore, options = {}) {
  const opts =
    safeObject(options);

  /*
    Por defecto NO confiamos en configuraciones antiguas del frontend
    que puedan apuntar a window.location.origin.
    El backend real queda fijado en api.onionit.net.
  */
  const explicit =
    opts.apiOrigin ||
    opts.baseURL ||
    opts.baseUrl ||
    opts.apiBase ||
    "";

  if (explicit) {
    setApiOrigin(explicit);
    return getApiOrigin();
  }

  const runtime =
    resolveRuntimeApiOrigin();

  setApiOrigin(runtime || DEFAULT_API_ORIGIN);

  try {
    if (
      AppCore?.config &&
      typeof AppCore.config === "object"
    ) {
      AppCore.config.apiOrigin =
        getApiOrigin();

      AppCore.config.apiBase =
        getApiOrigin();

      AppCore.config.apiUrl =
        getApiOrigin();
    }
  } catch {}

  return getApiOrigin();
}

function createApiClientFacade() {
  return {
    version:
      HTTP_VERSION,

    get origin() {
      return getApiOrigin();
    },

    setOrigin:
      setApiOrigin,

    buildUrl:
      buildApiUrl,

    request,

    get,
    post,
    put,
    patch,

    delete:
      del,

    del,

    login,
    me,
    refresh,
    refreshSession,
    logout,

    setTokenProvider,
    setAuthTokens,
    clearAuthTokens,
    getAccessToken,
    getRefreshToken,

    install:
      installHttp,

    getSnapshot:
      getHttpSnapshot,
  };
}

export function installHttp(AppCore = null, options = {}) {
  installedAppCore =
    AppCore || installedAppCore;

  configureAppCoreOrigin(
    installedAppCore,
    options
  );

  setTokenProvider(() => {
    const state =
      safeObject(installedAppCore?.state);

    const session =
      safeObject(state.session || state.sessionData);

    return (
      state.token ||
      state.accessToken ||
      state.access_token ||
      state.authToken ||
      state.jwt ||
      session.token ||
      session.accessToken ||
      session.access_token ||
      tokenMemory.token ||
      ""
    );
  });

  setAuthPayloadCommitter((payload, meta) => {
    commitAuthPayloadToCore(
      installedAppCore,
      payload,
      meta
    );
  });

  const api =
    createApiClientFacade();

  try {
    if (
      installedAppCore &&
      typeof installedAppCore === "object"
    ) {
      defineHiddenValue(
        installedAppCore,
        "http",
        api
      );

      defineHiddenValue(
        installedAppCore,
        "Http",
        api
      );

      defineHiddenValue(
        installedAppCore,
        "apiClient",
        api
      );

      if (
        !installedAppCore.services ||
        typeof installedAppCore.services !== "object"
      ) {
        installedAppCore.services =
          {};
      }

      installedAppCore.services.http =
        api;

      installedAppCore.services.Http =
        api;

      installedAppCore.services.api =
        api;

      installedAppCore.services.apiClient =
        api;
    }
  } catch {}

  try {
    if (
      installedAppCore?.modules &&
      isFunction(installedAppCore.modules.set)
    ) {
      installedAppCore.modules.set(
        "Http",
        api
      );

      installedAppCore.modules.set(
        "http",
        api
      );

      installedAppCore.modules.set(
        "ApiClient",
        api
      );

      installedAppCore.modules.set(
        "apiClient",
        api
      );
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.__ONION_HTTP__ =
        api;

      window.__ONION_API_ORIGIN__ =
        getApiOrigin();
    }
  } catch {}

  safeEmit(
    "http:installed",
    {
      origin:
        getApiOrigin(),

      appCore:
        Boolean(installedAppCore),
    }
  );

  return api;
}

/* =========================================================
   SNAPSHOT
========================================================= */

export function getHttpSnapshot() {
  return sanitizePayload({
    version:
      HTTP_VERSION,

    origin:
      getApiOrigin(),

    defaultOrigin:
      DEFAULT_API_ORIGIN,

    apiPrefix:
      DEFAULT_API_PREFIX,

    installed:
      Boolean(installedAppCore),

    hasFetch:
      typeof fetch === "function",

    hasAbortController:
      typeof AbortController === "function",

    hasTokenProvider:
      Boolean(tokenProvider),

    hasAuthPayloadCommitter:
      Boolean(authPayloadCommitter),

    hasAccessToken:
      Boolean(getAccessToken()),

    hasRefreshToken:
      Boolean(getRefreshToken()),

    refreshInFlight:
      Boolean(refreshPromise),

    endpoints: {
      login:
        buildApiUrl("/auth/login"),

      me:
        buildApiUrl("/auth/me"),

      refresh:
        buildApiUrl("/auth/refresh"),

      logout:
        buildApiUrl("/auth/logout"),
    },

    at:
      safeIsoDate(),
  });
}

/* =========================================================
   DEFAULT FACADE
========================================================= */

export const Http =
  createApiClientFacade();

try {
  setApiOrigin(
    resolveRuntimeApiOrigin()
  );
} catch {
  setApiOrigin(
    DEFAULT_API_ORIGIN
  );
}

try {
  if (isBrowser()) {
    window.__ONION_HTTP__ =
      Http;

    window.__ONION_API_ORIGIN__ =
      getApiOrigin();
  }
} catch {}

export default Http;

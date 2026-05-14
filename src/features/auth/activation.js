/* =========================================================
   Onion SPA - Auth Activation
   Archivo: src/features/auth/activation.js

   AUTH ACTIVATION · FINAL EXTREME PRO SYSTEM · GOD MODE v15

   RESPONSABILIDADES:
   - activar cuentas mediante token técnico
   - activar primer usuario si backend lo permite
   - validar token de activación si existe endpoint backend
   - extraer token desde query, path y hash-router
   - soportar /activate-account?token=...
   - soportar /activate-account/<token>
   - soportar #/activate-account?token=...
   - soportar #!/activate-account?token=...
   - construir payloads robustos compatibles con backends legacy
   - ejecutar transporte vía AppCore.apiClient / AppCore.request / Http / fetch
   - normalizar respuestas nested data / payload / result / body / response.data
   - aplicar sesión sólo si backend devuelve token + user válidos
   - no tocar sesión si backend sólo confirma activación
   - no romper rutas públicas técnicas
   - exponer API pública estable para Auth module

   HARDENING EXTREMO:
   - browser/server safe
   - timeout real en fetch
   - redirects anti open-redirect
   - token/password/identifier con límites
   - tokens/passwords no se truncan silenciosamente
   - eventos sin tokens ni passwords reales
   - no CSS / no inline style / no estilos inyectados
   - no localStorage.clear()
   - no sessionStorage.clear()
   - no refresh automático
   - no marca authenticated sin token + user válidos
   - éxito estricto: ok/success/activated/valid/completed/2xx o sesión completa
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  AUTH_ENDPOINTS,
  AUTH_ENDPOINT_CANDIDATES,
  AUTH_CONSTANTS,
  AUTH_TOKEN_PARAM_NAMES,
  getActivateAccountEndpoint as getActivateAccountEndpointFromConstants,
  getActivateFirstUserEndpoint as getActivateFirstUserEndpointFromConstants,
} from "./constants.js";

import {
  normalizeTokenValue as helperNormalizeTokenValue,
  sanitizeRedirectPath,
  redactTokenInText,
} from "./helpers.js";

import {
  extractToken,
  extractRefreshToken,
  extractUser,
  normalizeSessionPayload,
} from "./normalize.js";

import {
  applySession,
} from "./session.js";

/* =========================================================
   VERSION
========================================================= */

export const ACTIVATION_MODULE_VERSION =
  "activation.15.0.0";

/* =========================================================
   CONSTANTS
========================================================= */

const DEFAULT_ACTIVATE_ENDPOINT =
  "/api/auth/activate";

const DEFAULT_ACTIVATE_LEGACY_ENDPOINT =
  "/api/auth/activate-account";

const DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT =
  "/api/auth/activate/first-user";

const DEFAULT_VALIDATE_ENDPOINT =
  "/api/auth/activate/validate";

const DEFAULT_VALIDATE_LEGACY_ENDPOINT =
  "/api/auth/activate-account/validate";

const DEFAULT_LOGIN_REDIRECT =
  "/login";

const DEFAULT_HOME_REDIRECT =
  "/";

const ACTIVATION_PATH =
  "/activate-account";

const LOCAL_ORIGIN =
  "http://localhost";

const DEFAULT_TIMEOUT_MS =
  15000;

const SUCCESS_STATUS_TEXTS =
  Object.freeze([
    "ok",
    "success",
    "succeeded",
    "accepted",
    "valid",
    "active",
    "activated",
    "account_activated",
    "activation_success",
    "completed",
    "done",
    "created",
    "user_created",
    "first_user_created",
    "authenticated",
  ]);

const FAILURE_STATUS_TEXTS =
  Object.freeze([
    "error",
    "failed",
    "failure",
    "invalid",
    "unauthorized",
    "forbidden",
    "expired",
    "token_expired",
    "token_invalid",
    "activation_failed",
    "rate_limited",
    "too_many_requests",
  ]);

const FAILURE_CODES =
  Object.freeze([
    "INVALID_TOKEN",
    "TOKEN_INVALID",
    "TOKEN_EXPIRED",
    "ACTIVATION_TOKEN_INVALID",
    "ACTIVATION_TOKEN_EXPIRED",
    "MISSING_TOKEN",
    "MISSING_PASSWORD",
    "PASSWORD_MISMATCH",
    "INVALID_IDENTIFIER",
    "MISSING_IDENTIFIER",
    "ACCOUNT_ALREADY_ACTIVE",
    "USER_ALREADY_ACTIVE",
    "FIRST_USER_DISABLED",
    "FIRST_USER_ALREADY_EXISTS",
    "RATE_LIMITED",
    "TOO_MANY_REQUESTS",
    "UNAUTHORIZED",
    "FORBIDDEN",
  ]);

const CORRUPTED_TEXT_VALUES =
  Object.freeze([
    "undefined",
    "null",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
    "\"undefined\"",
    "\"null\"",
    "\"false\"",
    "\"true\"",
  ]);

const PASSWORD_FIELD_NAMES =
  Object.freeze([
    "password",
    "newPassword",
    "new_password",
    "confirmPassword",
    "passwordConfirmation",
    "password_confirmation",
    "repeatPassword",
    "repeat_password",
  ]);

const TOKEN_FIELD_NAMES =
  Object.freeze([
    "token",
    "code",
    "t",
    "activationToken",
    "activateToken",
    "activation_token",
    "activate_token",
  ]);

const REQUEST_METHOD_OPTIONS =
  Object.freeze({
    method:
      "POST",

    auth:
      false,

    public:
      true,

    skipAuth:
      true,

    silent:
      true,

    storeError:
      false,

    dedupe:
      false,

    _skipAuthRefresh:
      true,

    skipAuthRefresh:
      true,
  });

/* =========================================================
   RUNTIME STATE
========================================================= */

const runtime = {
  activateInFlight:
    null,

  firstUserInFlight:
    null,

  validateInFlight:
    null,

  lastActivateAt:
    0,

  lastFirstUserAt:
    0,

  lastValidateAt:
    0,

  activateCount:
    0,

  firstUserCount:
    0,

  validateCount:
    0,

  lastError:
    null,

  lastResult:
    null,
};

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function nowMs() {
  try {
    return Date.now();
  } catch {
    return 0;
  }
}

function isoNow(ms = nowMs()) {
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function safeText(value, fallback = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text =
    String(value).trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const numeric =
    Number(value);

  return Number.isFinite(numeric)
    ? numeric
    : fallback;
}

function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const numeric =
    safeNumber(value, min);

  return Math.min(
    Math.max(numeric, min),
    max
  );
}

function isObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function safeObject(value) {
  return isObject(value)
    ? value
    : {};
}

function isFunction(value) {
  return typeof value === "function";
}

function isAbsoluteUrl(value = "") {
  return /^https?:\/\//i.test(
    String(value || "")
  );
}

function isCorruptedTextValue(value = "") {
  const text =
    safeText(value, "")
      .toLowerCase();

  return (
    !text ||
    CORRUPTED_TEXT_VALUES.includes(text)
  );
}

function pickFirst(...values) {
  for (const value of values) {
    if (
      value === null ||
      value === undefined
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim() === ""
    ) {
      continue;
    }

    return value;
  }

  return null;
}

function pickFirstText(...values) {
  return safeText(
    pickFirst(...values),
    ""
  );
}

function safeClone(value, fallback = null) {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {}

  try {
    return JSON.parse(
      JSON.stringify(value)
    );
  } catch {
    return fallback;
  }
}

function unique(values = []) {
  return Array.from(
    new Set(
      values
        .flat(Infinity)
        .map((item) =>
          safeText(item, "")
        )
        .filter(Boolean)
    )
  );
}

/* =========================================================
   EVENT SAFETY
========================================================= */

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(
        /([?&#](?:token|activationToken|activateToken|activation_token|activate_token|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(\/activate-account\/)([^/?#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      );
  }
}

function sanitizeEventPayload(payload = {}, depth = 0) {
  if (depth > 6) {
    return "[MaxDepth]";
  }

  if (Array.isArray(payload)) {
    return payload.map((item) =>
      sanitizeEventPayload(
        item,
        depth + 1
      )
    );
  }

  if (!isObject(payload)) {
    return typeof payload === "string"
      ? redactSafe(payload)
      : payload;
  }

  const output = {};

  for (const [key, value] of Object.entries(payload)) {
    const lower =
      safeText(key, "")
        .toLowerCase();

    if (
      lower.includes("token") ||
      lower.includes("password") ||
      lower.includes("authorization") ||
      lower === "code" ||
      lower === "otp" ||
      lower === "totp" ||
      lower === "t"
    ) {
      output[key] =
        value ? "***" : value;
      continue;
    }

    if (
      lower.includes("url") ||
      lower.includes("path") ||
      lower.includes("redirect") ||
      lower.includes("endpoint")
    ) {
      output[key] =
        typeof value === "string"
          ? redactSafe(value)
          : sanitizeEventPayload(
              value,
              depth + 1
            );
      continue;
    }

    output[key] =
      sanitizeEventPayload(
        value,
        depth + 1
      );
  }

  return output;
}

function safeEmit(eventName, payload = {}) {
  const cleanEvent =
    safeText(eventName, "");

  if (!cleanEvent) {
    return false;
  }

  const cleanPayload =
    sanitizeEventPayload(payload);

  let emitted =
    false;

  try {
    AppCore?.events?.emit?.(
      cleanEvent,
      cleanPayload
    );

    emitted =
      true;
  } catch {}

  try {
    if (
      isBrowser() &&
      !emitted
    ) {
      document.dispatchEvent(
        new CustomEvent(cleanEvent, {
          detail:
            cleanPayload,
          bubbles:
            false,
          cancelable:
            false,
        })
      );

      emitted =
        true;
    }
  } catch {}

  return emitted;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[Activation]",
      ...args
    );
  } catch {}

  try {
    if (AppCore?.config?.debug) {
      console.warn(
        "[Activation]",
        ...args
      );
    }
  } catch {}
}

/* =========================================================
   LIMITS
========================================================= */

function getIdentifierMaxLength() {
  return clampNumber(
    AUTH_CONSTANTS?.identifierMaxLength ??
      160,
    1,
    512
  );
}

function getTokenMinLength() {
  return clampNumber(
    AUTH_CONSTANTS?.activationTokenMinLength ??
      AUTH_CONSTANTS?.tokenMinLength ??
      8,
    1,
    4096
  );
}

function getTokenMaxLength() {
  return clampNumber(
    AUTH_CONSTANTS?.activationTokenMaxLength ??
      AUTH_CONSTANTS?.tokenMaxLength ??
      8192,
    getTokenMinLength(),
    32768
  );
}

function getPasswordMinLength() {
  return clampNumber(
    AUTH_CONSTANTS?.activationPasswordMinLength ??
      AUTH_CONSTANTS?.passwordMinLength ??
      8,
    1,
    1024
  );
}

function getPasswordMaxLength() {
  return clampNumber(
    AUTH_CONSTANTS?.activationPasswordMaxLength ??
      AUTH_CONSTANTS?.passwordMaxLength ??
      1024,
    getPasswordMinLength(),
    8192
  );
}

function getRequestTimeout() {
  return clampNumber(
    AUTH_CONSTANTS?.requestTimeout ??
      AppCore?.config?.requestTimeout ??
      AppCore?.config?.api?.timeout ??
      DEFAULT_TIMEOUT_MS,
    1000,
    120000
  );
}

/* =========================================================
   DEFAULT MESSAGES
========================================================= */

function getDefaultActivationSuccessMessage() {
  return "La cuenta se ha activado correctamente.";
}

function getDefaultActivationErrorMessage() {
  return "No se pudo activar la cuenta.";
}

function getDefaultFirstUserSuccessMessage() {
  return "El primer usuario se ha activado correctamente.";
}

function getDefaultFirstUserErrorMessage() {
  return "No se pudo activar el primer usuario.";
}

function getDefaultValidateSuccessMessage() {
  return "El token de activación es válido.";
}

function getDefaultValidateErrorMessage() {
  return "El token de activación no es válido.";
}

/* =========================================================
   ENDPOINTS
========================================================= */

function firstEndpoint(candidates = [], fallback = "") {
  for (const candidate of candidates) {
    const value =
      safeText(candidate, "");

    if (value) {
      return value;
    }
  }

  return fallback;
}

function getConfiguredActivateEndpoint() {
  return firstEndpoint(
    [
      isFunction(getActivateAccountEndpointFromConstants)
        ? getActivateAccountEndpointFromConstants()
        : "",
      AUTH_ENDPOINTS?.activateAccount,
      AUTH_ENDPOINTS?.activation,
      AUTH_ENDPOINTS?.accountActivation,
      AUTH_ENDPOINTS?.confirmActivation,
      AUTH_ENDPOINTS?.activate,
      DEFAULT_ACTIVATE_ENDPOINT,
    ],
    DEFAULT_ACTIVATE_ENDPOINT
  );
}

function getConfiguredActivateFirstUserEndpoint() {
  return firstEndpoint(
    [
      isFunction(getActivateFirstUserEndpointFromConstants)
        ? getActivateFirstUserEndpointFromConstants()
        : "",
      AUTH_ENDPOINTS?.activateFirstUser,
      AUTH_ENDPOINTS?.firstUserActivation,
      DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT,
    ],
    DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT
  );
}

function getConfiguredValidateEndpoint() {
  return firstEndpoint(
    [
      AUTH_ENDPOINTS?.validateActivationToken,
      AUTH_ENDPOINTS?.activationValidate,
      AUTH_ENDPOINTS?.validateActivateAccount,
      AUTH_ENDPOINTS?.validateActivation,
      DEFAULT_VALIDATE_ENDPOINT,
    ],
    DEFAULT_VALIDATE_ENDPOINT
  );
}

function endpointCandidatesFor(type = "activate") {
  if (type === "first-user") {
    return unique([
      getConfiguredActivateFirstUserEndpoint(),
      ...(Array.isArray(AUTH_ENDPOINT_CANDIDATES?.activateFirstUser)
        ? AUTH_ENDPOINT_CANDIDATES.activateFirstUser
        : []),
      DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT,
    ]);
  }

  if (type === "validate") {
    return unique([
      getConfiguredValidateEndpoint(),
      ...(Array.isArray(AUTH_ENDPOINT_CANDIDATES?.validateActivationToken)
        ? AUTH_ENDPOINT_CANDIDATES.validateActivationToken
        : []),
      DEFAULT_VALIDATE_ENDPOINT,
      DEFAULT_VALIDATE_LEGACY_ENDPOINT,
    ]);
  }

  return unique([
    getConfiguredActivateEndpoint(),
    ...(Array.isArray(AUTH_ENDPOINT_CANDIDATES?.activateAccount)
      ? AUTH_ENDPOINT_CANDIDATES.activateAccount
      : []),
    DEFAULT_ACTIVATE_ENDPOINT,
    DEFAULT_ACTIVATE_LEGACY_ENDPOINT,
  ]);
}

export function getActivateAccountEndpoint() {
  return getConfiguredActivateEndpoint();
}

export function getActivationEndpoint() {
  return getConfiguredActivateEndpoint();
}

export function getAccountActivationEndpoint() {
  return getConfiguredActivateEndpoint();
}

export function getActivateFirstUserEndpoint() {
  return getConfiguredActivateFirstUserEndpoint();
}

export function getFirstUserActivationEndpoint() {
  return getConfiguredActivateFirstUserEndpoint();
}

export function getValidateActivationTokenEndpoint() {
  return getConfiguredValidateEndpoint();
}

export function getValidateActivateAccountTokenEndpoint() {
  return getConfiguredValidateEndpoint();
}

export function getValidateActivateTokenEndpoint() {
  return getConfiguredValidateEndpoint();
}

export function getValidateAccountActivationTokenEndpoint() {
  return getConfiguredValidateEndpoint();
}

/* =========================================================
   REDIRECT SAFETY
========================================================= */

function normalizeRelativePath(path = "") {
  let value =
    safeText(path, "");

  if (!value) {
    return "";
  }

  if (value.startsWith("//")) {
    return "";
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return "";
  }

  if (/[\r\n\t]/.test(value)) {
    return "";
  }

  if (
    value.toLowerCase().includes("%0d") ||
    value.toLowerCase().includes("%0a") ||
    value.toLowerCase().includes("%09") ||
    value.toLowerCase().includes("%5c") ||
    value.includes("\\")
  ) {
    return "";
  }

  try {
    const decoded =
      decodeURIComponent(value)
        .replace(/\\/g, "/");

    if (
      decoded.startsWith("//") ||
      /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
      /[\r\n\t]/.test(decoded)
    ) {
      return "";
    }
  } catch {
    return "";
  }

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value =
    value
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

  return value || "";
}

function sanitizeRedirect(value = "", fallback = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return fallback;
  }

  if (isAbsoluteUrl(raw)) {
    try {
      const parsed =
        new URL(raw);

      if (
        isBrowser() &&
        parsed.origin === window.location.origin
      ) {
        return normalizeRelativePath(
          `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`
        ) || fallback;
      }

      return fallback;
    } catch {
      return fallback;
    }
  }

  try {
    return sanitizeRedirectPath(
      raw,
      fallback || ""
    );
  } catch {
    return normalizeRelativePath(raw) || fallback;
  }
}

/* =========================================================
   PATH / TOKEN RESOLUTION
========================================================= */

function getBaseOrigin() {
  if (
    isBrowser() &&
    window.location?.origin
  ) {
    return window.location.origin;
  }

  return LOCAL_ORIGIN;
}

function isHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  return (
    raw.startsWith("#/") ||
    raw.startsWith("#!")
  );
}

function normalizeHashRouterPath(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return "/";
  }

  if (raw.startsWith("#!")) {
    return raw.replace(/^#!\/?/, "/") || "/";
  }

  return raw.replace(/^#\/?/, "/") || "/";
}

function getCurrentPath() {
  if (!isBrowser()) {
    return "";
  }

  try {
    const pathname =
      window.location.pathname || "/";

    const search =
      window.location.search || "";

    const hash =
      window.location.hash || "";

    if (
      hash &&
      isHashRouterPath(hash)
    ) {
      return normalizeHashRouterPath(hash);
    }

    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function getTokenParamNames(type = "activation") {
  const names =
    AUTH_TOKEN_PARAM_NAMES?.[type];

  if (Array.isArray(names)) {
    return names;
  }

  return [
    "token",
    "activationToken",
    "activateToken",
    "activation_token",
    "activate_token",
    "code",
    "t",
  ];
}

function normalizeActivationTokenValue(value = "") {
  const raw =
    safeText(value, "");

  if (
    !raw ||
    isCorruptedTextValue(raw)
  ) {
    return "";
  }

  let normalized =
    "";

  try {
    normalized =
      helperNormalizeTokenValue(
        raw,
        getTokenMaxLength()
      ) || "";
  } catch {
    normalized =
      raw;
  }

  normalized =
    safeText(normalized, "");

  if (/^bearer\s+/i.test(normalized)) {
    normalized =
      normalized.replace(/^bearer\s+/i, "")
        .trim();
  }

  if (
    !normalized ||
    isCorruptedTextValue(normalized) ||
    /[\r\n\t\s]/.test(normalized)
  ) {
    return "";
  }

  if (
    normalized.length > getTokenMaxLength()
  ) {
    return "";
  }

  return normalized;
}

function extractTokenFromSearch(search = "", names = getTokenParamNames("activation")) {
  try {
    const params =
      new URLSearchParams(search || "");

    for (const name of names) {
      const token =
        normalizeActivationTokenValue(
          params.get(name)
        );

      if (token) {
        return token;
      }
    }
  } catch {}

  return "";
}

function extractTokenFromHashQuery(hash = "", names = getTokenParamNames("activation")) {
  const cleanHash =
    safeText(hash, "");

  if (
    !cleanHash ||
    !cleanHash.includes("?")
  ) {
    return "";
  }

  const query =
    cleanHash
      .split("?")
      .slice(1)
      .join("?");

  return extractTokenFromSearch(
    query ? `?${query}` : "",
    names
  );
}

function extractTokenFromPath(path = "") {
  const raw =
    safeText(path, "");

  if (!raw) {
    return "";
  }

  try {
    const parsed =
      new URL(
        raw,
        getBaseOrigin()
      );

    const pathname =
      parsed.pathname || "";

    const marker =
      `${ACTIVATION_PATH}/`;

    if (pathname.startsWith(marker)) {
      const token =
        pathname
          .slice(marker.length)
          .split("/")[0];

      try {
        return normalizeActivationTokenValue(
          decodeURIComponent(token || "")
        ) || "";
      } catch {
        return normalizeActivationTokenValue(token) || "";
      }
    }
  } catch {
    const marker =
      `${ACTIVATION_PATH}/`;

    if (raw.startsWith(marker)) {
      const token =
        raw
          .slice(marker.length)
          .split("?")[0]
          .split("#")[0]
          .split("/")[0];

      try {
        return normalizeActivationTokenValue(
          decodeURIComponent(token || "")
        ) || "";
      } catch {
        return normalizeActivationTokenValue(token) || "";
      }
    }
  }

  return "";
}

function extractActivationTokenFromUrl(pathOrUrl = getCurrentPath()) {
  const raw =
    safeText(pathOrUrl, "");

  if (!raw) {
    return "";
  }

  const normalizedRaw =
    isHashRouterPath(raw)
      ? normalizeHashRouterPath(raw)
      : raw;

  const directPathToken =
    extractTokenFromPath(normalizedRaw);

  if (directPathToken) {
    return directPathToken;
  }

  try {
    const parsed =
      new URL(
        normalizedRaw,
        getBaseOrigin()
      );

    const fromSearch =
      extractTokenFromSearch(
        parsed.search,
        getTokenParamNames("activation")
      );

    if (fromSearch) {
      return fromSearch;
    }

    if (
      parsed.hash &&
      isHashRouterPath(parsed.hash)
    ) {
      const hashPath =
        normalizeHashRouterPath(parsed.hash);

      const hashPathToken =
        extractTokenFromPath(hashPath);

      if (hashPathToken) {
        return hashPathToken;
      }

      const hashQuery =
        hashPath.includes("?")
          ? hashPath
              .split("?")
              .slice(1)
              .join("?")
          : "";

      const fromHashRouterQuery =
        extractTokenFromSearch(
          hashQuery ? `?${hashQuery}` : "",
          getTokenParamNames("activation")
        );

      if (fromHashRouterQuery) {
        return fromHashRouterQuery;
      }
    }

    const fromHash =
      extractTokenFromHashQuery(
        parsed.hash,
        getTokenParamNames("activation")
      );

    if (fromHash) {
      return fromHash;
    }
  } catch {
    const query =
      normalizedRaw.includes("?")
        ? normalizedRaw
            .split("?")
            .slice(1)
            .join("?")
            .split("#")[0]
        : "";

    if (query) {
      const fromQuery =
        extractTokenFromSearch(
          `?${query}`,
          getTokenParamNames("activation")
        );

      if (fromQuery) {
        return fromQuery;
      }
    }
  }

  return "";
}

export function resolveActivationToken(payload = {}) {
  return normalizeActivationTokenValue(
    payload?.token ??
      payload?.code ??
      payload?.activationToken ??
      payload?.activateToken ??
      payload?.activation_token ??
      payload?.activate_token ??
      payload?.t ??
      extractActivationTokenFromUrl()
  ) || "";
}

export function extractActivationToken(value = getCurrentPath()) {
  return extractActivationTokenFromUrl(value);
}

/* =========================================================
   IDENTIFIER / PASSWORD
========================================================= */

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    safeText(value)
  );
}

function looksLikePhone(value = "") {
  const clean =
    safeText(value)
      .replace(/[^\d+]/g, "");

  return /^\+?\d{6,20}$/.test(clean);
}

function normalizeEmail(value = "") {
  return safeText(value)
    .toLowerCase()
    .slice(0, 254);
}

function normalizePhone(value = "") {
  return safeText(value)
    .replace(/[^\d+]/g, "")
    .slice(0, 32);
}

function normalizeUsername(value = "") {
  return safeText(value)
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function normalizeIdentifier(value = "") {
  const raw =
    safeText(value)
      .normalize("NFKC")
      .replace(/\s+/g, " ");

  if (isCorruptedTextValue(raw)) {
    return "";
  }

  /*
    No truncamos silenciosamente.
    Permitimos +1 para que la validación detecte exceso.
  */
  return raw.slice(
    0,
    getIdentifierMaxLength() + 1
  );
}

function normalizeName(value = "") {
  return safeText(value)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function normalizePasswordValue(value = "") {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value);
}

function resolveIdentifier(payload = {}) {
  return safeText(
    payload?.identifier ??
      payload?.login ??
      payload?.email ??
      payload?.username ??
      payload?.user ??
      payload?.phone ??
      payload?.telefono ??
      payload?.mobile ??
      "",
    ""
  );
}

/* =========================================================
   PAYLOAD NORMALIZATION
========================================================= */

export function normalizeActivationPayload(payload = {}) {
  const token =
    resolveActivationToken(payload);

  const password =
    normalizePasswordValue(
      payload?.password ??
        payload?.newPassword ??
        payload?.new_password ??
        ""
    );

  const confirmPassword =
    normalizePasswordValue(
      payload?.confirmPassword ??
        payload?.passwordConfirmation ??
        payload?.password_confirmation ??
        payload?.repeatPassword ??
        payload?.repeat_password ??
        ""
    );

  const identifier =
    normalizeIdentifier(
      resolveIdentifier(payload)
    );

  const email =
    looksLikeEmail(identifier)
      ? normalizeEmail(identifier)
      : "";

  const phone =
    !email && looksLikePhone(identifier)
      ? normalizePhone(identifier)
      : "";

  const username =
    !email && !phone
      ? normalizeUsername(identifier)
      : "";

  const name =
    normalizeName(
      payload?.name ??
        payload?.nombre ??
        payload?.displayName ??
        payload?.display_name ??
        payload?.fullName ??
        payload?.full_name ??
        ""
    );

  const redirect =
    sanitizeRedirect(
      payload?.redirect ??
        payload?.redirectTo ??
        payload?.returnTo ??
        DEFAULT_LOGIN_REDIRECT,
      DEFAULT_LOGIN_REDIRECT
    );

  const lang =
    safeText(
      payload?.lang ??
        payload?.language ??
        AppCore?.state?.lang ??
        AppCore?.config?.defaultLang ??
        "es",
      "es"
    ).slice(0, 8);

  return {
    token,
    password,
    confirmPassword,
    identifier,
    email,
    phone,
    username,
    name,
    redirect,
    lang,
  };
}

export function normalizeActivateAccountPayload(payload = {}) {
  return normalizeActivationPayload(payload);
}

export function normalizeFirstUserActivationPayload(payload = {}) {
  const base =
    normalizeActivationPayload(payload);

  const companyName =
    normalizeName(
      payload?.companyName ??
        payload?.company ??
        payload?.empresa ??
        payload?.cliente ??
        ""
    );

  return {
    ...base,

    companyName,
    empresa:
      companyName,
  };
}

export function normalizeValidateActivationTokenPayload(payload = {}) {
  return {
    token:
      resolveActivationToken(payload),
  };
}

/* =========================================================
   REQUEST BODY
========================================================= */

function stripEmptyValues(obj = {}) {
  const output = {};

  for (const [key, value] of Object.entries(obj || {})) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      continue;
    }

    output[key] = value;
  }

  return output;
}

export function buildActivateAccountBody(payload = {}) {
  const normalized =
    normalizeActivationPayload(payload);

  return stripEmptyValues({
    token:
      normalized.token,

    code:
      normalized.token,

    t:
      normalized.token,

    activationToken:
      normalized.token,

    activateToken:
      normalized.token,

    activation_token:
      normalized.token,

    activate_token:
      normalized.token,

    password:
      normalized.password,

    newPassword:
      normalized.password,

    new_password:
      normalized.password,

    confirmPassword:
      normalized.confirmPassword,

    passwordConfirmation:
      normalized.confirmPassword,

    password_confirmation:
      normalized.confirmPassword,

    repeatPassword:
      normalized.confirmPassword,

    repeat_password:
      normalized.confirmPassword,

    identifier:
      normalized.identifier,

    login:
      normalized.identifier,

    email:
      normalized.email,

    username:
      normalized.username,

    user:
      normalized.username,

    phone:
      normalized.phone,

    telefono:
      normalized.phone,

    name:
      normalized.name,

    nombre:
      normalized.name,

    displayName:
      normalized.name,

    display_name:
      normalized.name,

    redirect:
      normalized.redirect,

    redirectTo:
      normalized.redirect,

    returnTo:
      normalized.redirect,

    lang:
      normalized.lang,

    language:
      normalized.lang,
  });
}

export function buildActivationRequestBody(payload = {}) {
  return buildActivateAccountBody(payload);
}

export function buildActivateFirstUserBody(payload = {}) {
  const normalized =
    normalizeFirstUserActivationPayload(payload);

  return stripEmptyValues({
    ...buildActivateAccountBody(normalized),

    companyName:
      normalized.companyName,

    company:
      normalized.companyName,

    empresa:
      normalized.companyName,
  });
}

export function buildFirstUserActivationBody(payload = {}) {
  return buildActivateFirstUserBody(payload);
}

export function buildValidateActivationTokenBody(payload = {}) {
  const normalized =
    normalizeValidateActivationTokenPayload(payload);

  return stripEmptyValues({
    token:
      normalized.token,

    code:
      normalized.token,

    t:
      normalized.token,

    activationToken:
      normalized.token,

    activateToken:
      normalized.token,

    activation_token:
      normalized.token,

    activate_token:
      normalized.token,
  });
}

/* =========================================================
   RESPONSE NODE
========================================================= */

function getNode(input = {}) {
  const root =
    safeObject(input);

  const data =
    safeObject(root.data);

  const payload =
    safeObject(root.payload);

  const result =
    safeObject(root.result);

  const body =
    safeObject(root.body);

  const responseNode =
    safeObject(root.response);

  const responseData =
    safeObject(responseNode.data);

  const meta =
    safeObject(root.meta);

  return {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  };
}

/* =========================================================
   RESPONSE RESOLUTION
========================================================= */

function resolveExplicitOk(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  const values = [
    root.ok,
    root.success,
    root.valid,
    root.accepted,
    root.completed,
    root.activated,
    root.active,

    data.ok,
    data.success,
    data.valid,
    data.accepted,
    data.completed,
    data.activated,
    data.active,

    payload.ok,
    payload.success,
    payload.valid,
    payload.accepted,
    payload.completed,
    payload.activated,
    payload.active,

    result.ok,
    result.success,
    result.valid,
    result.accepted,
    result.completed,
    result.activated,
    result.active,

    body.ok,
    body.success,
    body.valid,
    body.accepted,
    body.completed,
    body.activated,
    body.active,

    responseNode.ok,
    responseNode.success,
    responseNode.valid,
    responseNode.accepted,
    responseNode.completed,
    responseNode.activated,
    responseNode.active,

    responseData.ok,
    responseData.success,
    responseData.valid,
    responseData.accepted,
    responseData.completed,
    responseData.activated,
    responseData.active,

    meta.ok,
    meta.success,
    meta.valid,
    meta.accepted,
    meta.completed,
    meta.activated,
    meta.active,
  ];

  for (const value of values) {
    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function resolveStatus(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return safeNumber(
    pickFirst(
      root.status,
      root.statusCode,
      root.status_code,

      data.status,
      data.statusCode,
      data.status_code,

      payload.status,
      payload.statusCode,
      payload.status_code,

      result.status,
      result.statusCode,
      result.status_code,

      body.status,
      body.statusCode,
      body.status_code,

      responseNode.status,
      responseNode.statusCode,
      responseNode.status_code,

      responseData.status,
      responseData.statusCode,
      responseData.status_code,

      meta.status,
      meta.statusCode,
      meta.status_code
    ),
    0
  );
}

function normalizeStatusText(value = "") {
  const text =
    safeText(value, "")
      .toLowerCase()
      .trim();

  if (!text) {
    return "";
  }

  const numeric =
    Number(text);

  if (Number.isFinite(numeric)) {
    return "";
  }

  return text;
}

function resolveStatusText(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  const candidates = [
    root.statusText,
    root.status_text,
    root.state,
    root.status,

    data.statusText,
    data.status_text,
    data.state,
    data.status,

    payload.statusText,
    payload.status_text,
    payload.state,
    payload.status,

    result.statusText,
    result.status_text,
    result.state,
    result.status,

    body.statusText,
    body.status_text,
    body.state,
    body.status,

    responseNode.statusText,
    responseNode.status_text,
    responseNode.state,
    responseNode.status,

    responseData.statusText,
    responseData.status_text,
    responseData.state,
    responseData.status,

    meta.statusText,
    meta.status_text,
    meta.state,
    meta.status,
  ];

  for (const candidate of candidates) {
    const text =
      normalizeStatusText(candidate);

    if (text) {
      return text;
    }
  }

  return "";
}

function resolveCode(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return safeText(
    pickFirst(
      root.code,
      root.errorCode,
      root.error_code,
      root.error,

      data.code,
      data.errorCode,
      data.error_code,
      data.error,

      payload.code,
      payload.errorCode,
      payload.error_code,
      payload.error,

      result.code,
      result.errorCode,
      result.error_code,
      result.error,

      body.code,
      body.errorCode,
      body.error_code,
      body.error,

      responseNode.code,
      responseNode.errorCode,
      responseNode.error_code,
      responseNode.error,

      responseData.code,
      responseData.errorCode,
      responseData.error_code,
      responseData.error,

      meta.code,
      meta.errorCode,
      meta.error_code,
      meta.error
    ),
    ""
  );
}

function parseRetryAfterToSeconds(value = "") {
  const raw =
    safeText(value, "");

  if (!raw) {
    return 0;
  }

  const numeric =
    Number(raw);

  if (Number.isFinite(numeric)) {
    return Math.max(
      0,
      Math.ceil(numeric)
    );
  }

  const dateMs =
    Date.parse(raw);

  if (Number.isFinite(dateMs)) {
    return Math.max(
      0,
      Math.ceil((dateMs - Date.now()) / 1000)
    );
  }

  return 0;
}

function resolveRetryAfter(input = {}) {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return Math.max(
    0,
    safeNumber(
      pickFirst(
        root.retryAfter,
        root.retry_after,
        root.cooldownSeconds,
        root.cooldown_seconds,
        root.rateLimitSeconds,
        root.rate_limit_seconds,

        data.retryAfter,
        data.retry_after,
        data.cooldownSeconds,
        data.cooldown_seconds,
        data.rateLimitSeconds,
        data.rate_limit_seconds,

        payload.retryAfter,
        payload.retry_after,
        payload.cooldownSeconds,
        payload.cooldown_seconds,

        result.retryAfter,
        result.retry_after,
        result.cooldownSeconds,
        result.cooldown_seconds,

        body.retryAfter,
        body.retry_after,
        body.cooldownSeconds,
        body.cooldown_seconds,

        responseNode.retryAfter,
        responseNode.retry_after,
        responseNode.cooldownSeconds,
        responseNode.cooldown_seconds,

        responseData.retryAfter,
        responseData.retry_after,
        responseData.cooldownSeconds,
        responseData.cooldown_seconds,

        meta.retryAfter,
        meta.retry_after,
        meta.cooldownSeconds,
        meta.cooldown_seconds
      ),
      0
    )
  );
}

function resolveMessage(input = {}, fallback = "") {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return pickFirstText(
    root.message,
    root.mensaje,
    root.detail,
    root.description,
    root.error,

    data.message,
    data.mensaje,
    data.detail,
    data.description,
    data.error,

    payload.message,
    payload.mensaje,
    payload.detail,
    payload.description,
    payload.error,

    result.message,
    result.mensaje,
    result.detail,
    result.description,
    result.error,

    body.message,
    body.mensaje,
    body.detail,
    body.description,
    body.error,

    responseNode.message,
    responseNode.mensaje,
    responseNode.detail,
    responseNode.description,
    responseNode.error,

    responseData.message,
    responseData.mensaje,
    responseData.detail,
    responseData.description,
    responseData.error,

    meta.message,
    meta.mensaje,
    meta.detail,
    meta.description,
    meta.error,

    fallback
  );
}

function resolveRedirectTo(input = {}, fallback = "") {
  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return sanitizeRedirect(
    pickFirstText(
      root.redirectTo,
      root.redirect_to,
      root.redirect,
      root.next,
      root.nextPath,
      root.next_path,

      data.redirectTo,
      data.redirect_to,
      data.redirect,
      data.next,
      data.nextPath,
      data.next_path,

      payload.redirectTo,
      payload.redirect_to,
      payload.redirect,
      payload.next,
      payload.nextPath,
      payload.next_path,

      result.redirectTo,
      result.redirect_to,
      result.redirect,
      result.next,
      result.nextPath,
      result.next_path,

      body.redirectTo,
      body.redirect_to,
      body.redirect,
      body.next,
      body.nextPath,
      body.next_path,

      responseNode.redirectTo,
      responseNode.redirect_to,
      responseNode.redirect,
      responseNode.next,
      responseNode.nextPath,
      responseNode.next_path,

      responseData.redirectTo,
      responseData.redirect_to,
      responseData.redirect,
      responseData.next,
      responseData.nextPath,
      responseData.next_path,

      meta.redirectTo,
      meta.redirect_to,
      meta.redirect,
      meta.next,

      fallback
    ),
    fallback
  );
}

function isExplicitFailure(input = {}) {
  const explicitOk =
    resolveExplicitOk(input);

  if (explicitOk === false) {
    return true;
  }

  const status =
    resolveStatus(input);

  if (
    Number.isFinite(status) &&
    status >= 400
  ) {
    return true;
  }

  const statusText =
    resolveStatusText(input);

  if (
    statusText &&
    FAILURE_STATUS_TEXTS.includes(statusText)
  ) {
    return true;
  }

  const code =
    resolveCode(input)
      .toUpperCase();

  if (
    code &&
    FAILURE_CODES.includes(code)
  ) {
    return true;
  }

  return false;
}

function isDeclaredSuccess(input = {}) {
  const explicitOk =
    resolveExplicitOk(input);

  if (explicitOk === true) {
    return true;
  }

  if (explicitOk === false) {
    return false;
  }

  const status =
    resolveStatus(input);

  if (
    status >= 200 &&
    status < 300
  ) {
    return true;
  }

  const statusText =
    resolveStatusText(input);

  return Boolean(
    statusText &&
      SUCCESS_STATUS_TEXTS.includes(statusText)
  );
}

function hasCompleteSession(input = {}) {
  const token =
    safeText(extractToken(input), "");

  const user =
    extractUser(input);

  return Boolean(
    token &&
      user &&
      (
        user.id ||
        user.userId ||
        user.email ||
        user.username ||
        user.phone
      )
  );
}

function isCooldownResponse(input = {}) {
  const status =
    resolveStatus(input);

  const retryAfter =
    resolveRetryAfter(input);

  const code =
    resolveCode(input)
      .toUpperCase();

  const statusText =
    resolveStatusText(input);

  const {
    root,
    data,
    payload,
    result,
    body,
    responseNode,
    responseData,
    meta,
  } = getNode(input);

  return Boolean(
    status === 429 ||
      retryAfter > 0 ||
      code === "RATE_LIMITED" ||
      code === "TOO_MANY_REQUESTS" ||
      statusText === "rate_limited" ||
      statusText === "too_many_requests" ||
      root.cooldown === true ||
      data.cooldown === true ||
      payload.cooldown === true ||
      result.cooldown === true ||
      body.cooldown === true ||
      responseNode.cooldown === true ||
      responseData.cooldown === true ||
      meta.cooldown === true
  );
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function buildBaseNormalizedResponse({
  input = {},
  successMessage = "",
  errorMessage = "",
  redirectFallback = "",
} = {}) {
  const cooldown =
    isCooldownResponse(input);

  const retryAfter =
    resolveRetryAfter(input);

  const explicitFailure =
    isExplicitFailure(input);

  const sessionComplete =
    hasCompleteSession(input);

  const ok =
    explicitFailure
      ? false
      : (
          isDeclaredSuccess(input) ||
          sessionComplete
        );

  const token =
    extractToken(input);

  const refreshToken =
    extractRefreshToken(input);

  const user =
    extractUser(input);

  const sessionData =
    normalizeSessionPayload(input);

  const message =
    resolveMessage(
      input,
      ok
        ? successMessage
        : cooldown
          ? "Espera un momento antes de volver a intentarlo."
          : errorMessage
    );

  return {
    raw:
      input,

    ok,
    success:
      ok,
    error:
      !ok,

    activated:
      ok,

    valid:
      ok,

    authenticated:
      Boolean(sessionComplete),

    status:
      resolveStatus(input),

    statusText:
      resolveStatusText(input) || null,

    code:
      resolveCode(input) || null,

    explicitFailure,

    cooldown,
    rateLimited:
      cooldown,

    retryAfter,
    cooldownSeconds:
      retryAfter,

    message,

    redirectTo:
      resolveRedirectTo(
        input,
        redirectFallback
      ),

    token:
      token || null,

    accessToken:
      token || null,

    access_token:
      token || null,

    refreshToken:
      refreshToken || null,

    refresh_token:
      refreshToken || null,

    user:
      user || null,

    usuario:
      user || null,

    me:
      user || null,

    session:
      sessionData || null,

    sessionData:
      sessionData || null,

    at:
      isoNow(),
  };
}

export function normalizeActivationResponse(input = {}) {
  return buildBaseNormalizedResponse({
    input,
    successMessage:
      getDefaultActivationSuccessMessage(),
    errorMessage:
      getDefaultActivationErrorMessage(),
    redirectFallback:
      DEFAULT_LOGIN_REDIRECT,
  });
}

export function normalizeActivateAccountResponse(input = {}) {
  return normalizeActivationResponse(input);
}

export function normalizeFirstUserActivationResponse(input = {}) {
  return buildBaseNormalizedResponse({
    input,
    successMessage:
      getDefaultFirstUserSuccessMessage(),
    errorMessage:
      getDefaultFirstUserErrorMessage(),
    redirectFallback:
      DEFAULT_HOME_REDIRECT,
  });
}

export function normalizeValidateActivationTokenResponse(input = {}) {
  return buildBaseNormalizedResponse({
    input,
    successMessage:
      getDefaultValidateSuccessMessage(),
    errorMessage:
      getDefaultValidateErrorMessage(),
    redirectFallback:
      "",
  });
}

/* =========================================================
   URL RESOLUTION
========================================================= */

function buildFinalUrl(endpoint = "") {
  const clean =
    safeText(endpoint, "");

  if (!clean) {
    return DEFAULT_ACTIVATE_ENDPOINT;
  }

  if (isAbsoluteUrl(clean)) {
    return clean;
  }

  const apiBase =
    safeText(
      AppCore?.config?.apiBase ||
        AppCore?.config?.api?.baseUrl ||
        AppCore?.config?.api?.base ||
        "",
      ""
    );

  if (!apiBase) {
    return clean;
  }

  const base =
    apiBase.replace(/\/+$/g, "");

  const path =
    clean.startsWith("/")
      ? clean
      : `/${clean}`;

  if (
    base.endsWith("/api") &&
    path.startsWith("/api/")
  ) {
    return `${base}${path.slice(4)}`;
  }

  return `${base}${path}`;
}

/* =========================================================
   ERROR NORMALIZATION
========================================================= */

function normalizeTransportError(
  error = null,
  fallbackMessage = getDefaultActivationErrorMessage()
) {
  const status =
    safeNumber(
      error?.status ??
        error?.statusCode ??
        error?.response?.status ??
        error?.data?.status ??
        error?.response?.data?.status ??
        0,
      0
    );

  const retryAfter =
    Math.max(
      0,
      safeNumber(
        error?.retryAfter ??
          error?.retry_after ??
          error?.cooldownSeconds ??
          error?.cooldown_seconds ??
          error?.data?.retryAfter ??
          error?.data?.retry_after ??
          error?.data?.cooldownSeconds ??
          error?.data?.cooldown_seconds ??
          error?.response?.data?.retryAfter ??
          error?.response?.data?.retry_after ??
          error?.response?.data?.cooldownSeconds ??
          error?.response?.data?.cooldown_seconds ??
          0,
        0
      )
    );

  const message =
    safeText(
      error?.data?.message ??
        error?.data?.mensaje ??
        error?.data?.error ??
        error?.response?.data?.message ??
        error?.response?.data?.mensaje ??
        error?.response?.data?.error ??
        error?.message,
      status === 429 || retryAfter > 0
        ? "Espera un momento antes de volver a intentarlo."
        : fallbackMessage
    );

  return {
    ok:
      false,
    success:
      false,
    error:
      true,

    status,

    statusText:
      error?.statusText || null,

    code:
      error?.code ||
      error?.data?.code ||
      error?.response?.data?.code ||
      null,

    retryAfter,
    cooldownSeconds:
      retryAfter,

    cooldown:
      status === 429 || retryAfter > 0,

    rateLimited:
      status === 429 || retryAfter > 0,

    message,

    data:
      error?.data ||
      error?.response?.data ||
      null,

    raw:
      error || null,
  };
}

function rememberError(type = "unknown", error = null) {
  runtime.lastError = {
    type,
    message:
      safeText(error?.message, ""),
    status:
      error?.status || 0,
    code:
      error?.code || null,
    at:
      isoNow(),
  };
}

function rememberResult(type = "unknown", result = {}) {
  runtime.lastResult = {
    type,
    ok:
      Boolean(result?.ok),
    authenticated:
      Boolean(result?.authenticated),
    status:
      result?.status || 0,
    statusText:
      result?.statusText || null,
    code:
      result?.code || null,
    cooldown:
      Boolean(result?.cooldown),
    retryAfter:
      result?.retryAfter || 0,
    at:
      isoNow(),
  };
}

function shouldTryNextEndpoint(error = null) {
  const status =
    safeNumber(
      error?.status ||
        error?.statusCode ||
        error?.response?.status ||
        error?.data?.status ||
        error?.response?.data?.status ||
        0,
      0
    );

  return [
    404,
    405,
    410,
    501,
  ].includes(status);
}

/* =========================================================
   FETCH WITH TIMEOUT
========================================================= */

async function parseFetchBody(httpResponse) {
  const contentType =
    safeText(
      httpResponse?.headers?.get?.("content-type"),
      ""
    ).toLowerCase();

  try {
    if (contentType.includes("application/json")) {
      return await httpResponse.json();
    }

    const text =
      await httpResponse.text();

    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch {
      return {
        message:
          text,
      };
    }
  } catch {
    return {};
  }
}

async function fetchJsonWithTimeout(
  url,
  body,
  timeoutMs = getRequestTimeout()
) {
  if (typeof fetch !== "function") {
    const error =
      new Error("Fetch API no disponible.");

    error.status =
      500;
    error.code =
      "FETCH_MISSING";

    throw error;
  }

  const controller =
    typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

  const timer =
    controller
      ? setTimeout(() => {
          try {
            controller.abort("activation-timeout");
          } catch {
            try {
              controller.abort();
            } catch {}
          }
        }, timeoutMs)
      : null;

  try {
    const httpResponse =
      await fetch(url, {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/json",

          Accept:
            "application/json",
        },

        credentials:
          "omit",

        cache:
          "no-store",

        body:
          JSON.stringify(body),

        signal:
          controller?.signal,
      });

    const payload =
      safeObject(
        await parseFetchBody(httpResponse)
      );

    const retryAfterHeader =
      parseRetryAfterToSeconds(
        httpResponse.headers?.get?.("retry-after") || ""
      );

    const enrichedPayload = {
      ...payload,

      status:
        payload.status ??
        payload.statusCode ??
        httpResponse.status,

      statusCode:
        payload.statusCode ??
        payload.status ??
        httpResponse.status,

      retryAfter:
        payload.retryAfter ??
        payload.retry_after ??
        payload.cooldownSeconds ??
        retryAfterHeader,
    };

    if (!httpResponse.ok) {
      const error =
        new Error(
          resolveMessage(
            enrichedPayload,
            httpResponse.statusText || getDefaultActivationErrorMessage()
          )
        );

      error.status =
        httpResponse.status;
      error.statusText =
        httpResponse.statusText;
      error.data =
        enrichedPayload;
      error.retryAfter =
        enrichedPayload.retryAfter || 0;

      throw error;
    }

    return enrichedPayload;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/* =========================================================
   TRANSPORTS
========================================================= */

function buildRequestOptions(options = {}) {
  return {
    ...REQUEST_METHOD_OPTIONS,

    timeout:
      getRequestTimeout(),

    timeoutMs:
      getRequestTimeout(),

    useLoader:
      options.useLoader !== false,

    ...safeObject(options),

    auth:
      false,

    public:
      true,

    skipAuth:
      true,

    silent:
      true,

    storeError:
      false,

    _skipAuthRefresh:
      true,

    skipAuthRefresh:
      true,
  };
}

async function requestWithApiClient(endpoint, body, options = {}) {
  const apiClient =
    AppCore?.apiClient || null;

  if (!apiClient) {
    return null;
  }

  const requestOptions =
    buildRequestOptions(options);

  if (isFunction(apiClient.post)) {
    return apiClient.post(
      endpoint,
      body,
      requestOptions
    );
  }

  if (isFunction(apiClient.request)) {
    try {
      return await apiClient.request(
        endpoint,
        {
          ...requestOptions,
          method:
            "POST",
          body,
        }
      );
    } catch (error) {
      if (shouldTryNextEndpoint(error)) {
        throw error;
      }

      try {
        return await apiClient.request(
          "POST",
          endpoint,
          {
            ...requestOptions,
            body,
          }
        );
      } catch {
        throw error;
      }
    }
  }

  return null;
}

async function requestWithAppCoreRequest(endpoint, body, options = {}) {
  if (!isFunction(AppCore?.request)) {
    return null;
  }

  const requestOptions =
    buildRequestOptions(options);

  try {
    return await AppCore.request(
      endpoint,
      {
        ...requestOptions,
        method:
          "POST",
        body,
      }
    );
  } catch (error) {
    if (shouldTryNextEndpoint(error)) {
      throw error;
    }

    try {
      return await AppCore.request(
        "POST",
        endpoint,
        {
          ...requestOptions,
          body,
        }
      );
    } catch {
      throw error;
    }
  }
}

async function requestWithHttpService(endpoint, body, options = {}) {
  const http =
    AppCore?.http ||
    AppCore?.Http ||
    AppCore?.services?.http ||
    AppCore?.services?.Http ||
    null;

  if (!http) {
    return null;
  }

  const requestOptions =
    buildRequestOptions(options);

  if (isFunction(http.post)) {
    return http.post(
      endpoint,
      body,
      requestOptions
    );
  }

  if (isFunction(http.request)) {
    try {
      return await http.request(
        "POST",
        endpoint,
        {
          ...requestOptions,
          body,
        }
      );
    } catch (error) {
      if (shouldTryNextEndpoint(error)) {
        throw error;
      }

      try {
        return await http.request(
          endpoint,
          {
            ...requestOptions,
            method:
              "POST",
            body,
          }
        );
      } catch {
        throw error;
      }
    }
  }

  return null;
}

async function requestWithFetch(endpoint, body) {
  const url =
    buildFinalUrl(endpoint);

  return fetchJsonWithTimeout(
    url,
    body,
    getRequestTimeout()
  );
}

async function executeActivationRequest(endpoint, body, options = {}) {
  const transports = [
    requestWithApiClient,
    requestWithAppCoreRequest,
    requestWithHttpService,
  ];

  for (const transport of transports) {
    const result =
      await transport(
        endpoint,
        body,
        options
      );

    if (
      result !== null &&
      result !== undefined
    ) {
      return result;
    }
  }

  return requestWithFetch(
    endpoint,
    body
  );
}

async function executeActivationRequestWithCandidates(
  candidates = [],
  body = {},
  options = {}
) {
  const endpoints =
    unique(candidates);

  let lastError =
    null;

  for (const endpoint of endpoints) {
    try {
      return await executeActivationRequest(
        endpoint,
        body,
        {
          ...options,
          endpoint,
        }
      );
    } catch (error) {
      lastError =
        error;

      if (!shouldTryNextEndpoint(error)) {
        throw error;
      }
    }
  }

  throw lastError ||
    new Error("No hay endpoint de activación disponible.");
}

/* =========================================================
   VALIDATION
========================================================= */

function validateActivationPayload(normalized = {}, options = {}) {
  if (!normalized.token) {
    return "No se recibió token de activación.";
  }

  if (
    normalized.token.length <
    getTokenMinLength()
  ) {
    return "El token de activación no es válido.";
  }

  if (
    normalized.identifier &&
    normalized.identifier.length >
      getIdentifierMaxLength()
  ) {
    return "El identificador es demasiado largo.";
  }

  if (options.allowPasswordless === true) {
    return "";
  }

  if (!normalized.password) {
    return "La contraseña es obligatoria.";
  }

  if (
    normalized.password.length <
    getPasswordMinLength()
  ) {
    return `La contraseña debe tener al menos ${getPasswordMinLength()} caracteres.`;
  }

  if (
    normalized.password.length >
    getPasswordMaxLength()
  ) {
    return "La contraseña es demasiado larga.";
  }

  if (!normalized.confirmPassword) {
    return "La confirmación de contraseña es obligatoria.";
  }

  if (
    normalized.confirmPassword.length >
    getPasswordMaxLength()
  ) {
    return "La confirmación de contraseña es demasiado larga.";
  }

  if (
    normalized.password !==
    normalized.confirmPassword
  ) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

function validateFirstUserPayload(normalized = {}, options = {}) {
  if (options.allowTokenlessFirstUser !== true && !normalized.token) {
    return "No se recibió token de activación.";
  }

  if (
    normalized.token &&
    normalized.token.length < getTokenMinLength()
  ) {
    return "El token de activación no es válido.";
  }

  if (!normalized.identifier) {
    return "No se recibió email, usuario o teléfono para activar el primer usuario.";
  }

  if (
    normalized.identifier.length >
    getIdentifierMaxLength()
  ) {
    return "El identificador es demasiado largo.";
  }

  if (!normalized.password) {
    return "La contraseña es obligatoria.";
  }

  if (
    normalized.password.length <
    getPasswordMinLength()
  ) {
    return `La contraseña debe tener al menos ${getPasswordMinLength()} caracteres.`;
  }

  if (
    normalized.password.length >
    getPasswordMaxLength()
  ) {
    return "La contraseña es demasiado larga.";
  }

  if (!normalized.confirmPassword) {
    return "La confirmación de contraseña es obligatoria.";
  }

  if (
    normalized.confirmPassword.length >
    getPasswordMaxLength()
  ) {
    return "La confirmación de contraseña es demasiado larga.";
  }

  if (
    normalized.password !==
    normalized.confirmPassword
  ) {
    return "Las contraseñas no coinciden.";
  }

  return "";
}

function validateTokenPayload(normalized = {}) {
  if (!normalized.token) {
    return "No se recibió token de activación.";
  }

  if (
    normalized.token.length <
    getTokenMinLength()
  ) {
    return "El token de activación no es válido.";
  }

  return "";
}

/* =========================================================
   SESSION COMMIT
========================================================= */

function hasUsableReturnedUser(user = null) {
  return Boolean(
    user &&
      isObject(user) &&
      user.active !== false &&
      (
        user.id ||
        user.userId ||
        user.user_id ||
        user.email ||
        user.username ||
        user.phone
      )
  );
}

function maybeApplyReturnedSession(normalizedResponse = {}, source = "activation") {
  if (
    !normalizedResponse?.authenticated ||
    !normalizedResponse?.token ||
    !hasUsableReturnedUser(normalizedResponse?.user)
  ) {
    return null;
  }

  try {
    const snapshot =
      applySession({
        token:
          normalizedResponse.token,

        accessToken:
          normalizedResponse.token,

        access_token:
          normalizedResponse.token,

        refreshToken:
          normalizedResponse.refreshToken || null,

        refresh_token:
          normalizedResponse.refreshToken || null,

        user:
          normalizedResponse.user,

        usuario:
          normalizedResponse.user,

        me:
          normalizedResponse.user,

        account:
          normalizedResponse.user,

        profile:
          normalizedResponse.user,

        session:
          normalizedResponse.sessionData ||
          normalizedResponse.session ||
          null,

        sessionData:
          normalizedResponse.sessionData ||
          normalizedResponse.session ||
          null,

        authenticated:
          true,

        source,
        eventMode:
          "activation",
      });

    safeEmit(
      "auth:activation:session-applied",
      {
        authenticated:
          Boolean(snapshot?.authenticated),
        hasUser:
          Boolean(snapshot?.user),
        role:
          snapshot?.role || null,
        source,
      }
    );

    return snapshot;
  } catch (error) {
    safeWarn(
      "No se pudo aplicar sesión devuelta por activación.",
      error
    );

    return null;
  }
}

/* =========================================================
   ACTIONS
========================================================= */

export async function activateAccount(payload = {}, options = {}) {
  if (runtime.activateInFlight) {
    return runtime.activateInFlight;
  }

  const normalized =
    normalizeActivationPayload(payload);

  const validationError =
    validateActivationPayload(
      normalized,
      options
    );

  if (validationError) {
    return normalizeActivationResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoints =
    endpointCandidatesFor("activate");

  const body =
    buildActivateAccountBody(normalized);

  runtime.activateCount += 1;
  runtime.lastActivateAt =
    nowMs();

  safeEmit(
    "auth:activation:start",
    {
      endpoints,
      hasPassword:
        Boolean(normalized.password),
      hasIdentifier:
        Boolean(normalized.identifier),
    }
  );

  runtime.activateInFlight =
    (async () => {
      try {
        const raw =
          await executeActivationRequestWithCandidates(
            endpoints,
            body,
            {
              ...safeObject(options),
              _skipAuthRefresh:
                true,
              auth:
                false,
              public:
                true,
              silent:
                true,
              storeError:
                false,
            }
          );

        const normalizedResponse =
          normalizeActivationResponse(raw);

        const sessionSnapshot =
          maybeApplyReturnedSession(
            normalizedResponse,
            "activation"
          );

        const finalResponse = {
          ...normalizedResponse,

          sessionApplied:
            Boolean(sessionSnapshot),
        };

        rememberResult(
          "activation",
          finalResponse
        );

        safeEmit(
          "auth:activation:complete",
          {
            ok:
              finalResponse.ok,
            authenticated:
              finalResponse.authenticated,
            sessionApplied:
              finalResponse.sessionApplied,
            status:
              finalResponse.status,
            statusText:
              finalResponse.statusText,
            redirectTo:
              finalResponse.redirectTo,
          }
        );

        return finalResponse;
      } catch (error) {
        rememberError(
          "activation",
          error
        );

        const normalizedError =
          normalizeTransportError(
            error,
            getDefaultActivationErrorMessage()
          );

        const normalizedResponse =
          normalizeActivationResponse(
            normalizedError
          );

        rememberResult(
          "activation:error",
          normalizedResponse
        );

        safeEmit(
          "auth:activation:error",
          {
            status:
              normalizedResponse.status,
            statusText:
              normalizedResponse.statusText,
            code:
              normalizedResponse.code,
            message:
              normalizedResponse.message,
          }
        );

        return normalizedResponse;
      } finally {
        runtime.activateInFlight =
          null;
      }
    })();

  return runtime.activateInFlight;
}

export async function activateFirstUser(payload = {}, options = {}) {
  if (runtime.firstUserInFlight) {
    return runtime.firstUserInFlight;
  }

  const normalized =
    normalizeFirstUserActivationPayload(payload);

  const validationError =
    validateFirstUserPayload(
      normalized,
      options
    );

  if (validationError) {
    return normalizeFirstUserActivationResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoints =
    endpointCandidatesFor("first-user");

  const body =
    buildActivateFirstUserBody(normalized);

  runtime.firstUserCount += 1;
  runtime.lastFirstUserAt =
    nowMs();

  safeEmit(
    "auth:activation:first-user:start",
    {
      endpoints,
      identifierType:
        normalized.email
          ? "email"
          : normalized.phone
            ? "phone"
            : normalized.username
              ? "username"
              : "identifier",
      hasCompanyName:
        Boolean(normalized.companyName),
    }
  );

  runtime.firstUserInFlight =
    (async () => {
      try {
        const raw =
          await executeActivationRequestWithCandidates(
            endpoints,
            body,
            {
              ...safeObject(options),
              _skipAuthRefresh:
                true,
              auth:
                false,
              public:
                true,
              silent:
                true,
              storeError:
                false,
            }
          );

        const normalizedResponse =
          normalizeFirstUserActivationResponse(raw);

        const sessionSnapshot =
          maybeApplyReturnedSession(
            normalizedResponse,
            "activation:first-user"
          );

        const finalResponse = {
          ...normalizedResponse,

          sessionApplied:
            Boolean(sessionSnapshot),
        };

        rememberResult(
          "first-user",
          finalResponse
        );

        safeEmit(
          "auth:activation:first-user:complete",
          {
            ok:
              finalResponse.ok,
            authenticated:
              finalResponse.authenticated,
            sessionApplied:
              finalResponse.sessionApplied,
            status:
              finalResponse.status,
            statusText:
              finalResponse.statusText,
            redirectTo:
              finalResponse.redirectTo,
          }
        );

        return finalResponse;
      } catch (error) {
        rememberError(
          "first-user",
          error
        );

        const normalizedError =
          normalizeTransportError(
            error,
            getDefaultFirstUserErrorMessage()
          );

        const normalizedResponse =
          normalizeFirstUserActivationResponse(
            normalizedError
          );

        rememberResult(
          "first-user:error",
          normalizedResponse
        );

        safeEmit(
          "auth:activation:first-user:error",
          {
            status:
              normalizedResponse.status,
            statusText:
              normalizedResponse.statusText,
            code:
              normalizedResponse.code,
            message:
              normalizedResponse.message,
          }
        );

        return normalizedResponse;
      } finally {
        runtime.firstUserInFlight =
          null;
      }
    })();

  return runtime.firstUserInFlight;
}

export async function validateActivationToken(payload = {}, options = {}) {
  if (runtime.validateInFlight) {
    return runtime.validateInFlight;
  }

  const normalized =
    normalizeValidateActivationTokenPayload(payload);

  const validationError =
    validateTokenPayload(normalized);

  if (validationError) {
    return normalizeValidateActivationTokenResponse({
      ok:
        false,
      status:
        400,
      message:
        validationError,
    });
  }

  const endpoints =
    endpointCandidatesFor("validate");

  const body =
    buildValidateActivationTokenBody(normalized);

  runtime.validateCount += 1;
  runtime.lastValidateAt =
    nowMs();

  safeEmit(
    "auth:activation:validate:start",
    {
      endpoints,
    }
  );

  runtime.validateInFlight =
    (async () => {
      try {
        const raw =
          await executeActivationRequestWithCandidates(
            endpoints,
            body,
            {
              ...safeObject(options),
              _skipAuthRefresh:
                true,
              auth:
                false,
              public:
                true,
              silent:
                true,
              storeError:
                false,
            }
          );

        const normalizedResponse =
          normalizeValidateActivationTokenResponse(raw);

        rememberResult(
          "validate",
          normalizedResponse
        );

        safeEmit(
          "auth:activation:validate:complete",
          {
            ok:
              normalizedResponse.ok,
            status:
              normalizedResponse.status,
            statusText:
              normalizedResponse.statusText,
          }
        );

        return normalizedResponse;
      } catch (error) {
        rememberError(
          "validate",
          error
        );

        const normalizedError =
          normalizeTransportError(
            error,
            getDefaultValidateErrorMessage()
          );

        const normalizedResponse =
          normalizeValidateActivationTokenResponse(
            normalizedError
          );

        rememberResult(
          "validate:error",
          normalizedResponse
        );

        safeEmit(
          "auth:activation:validate:error",
          {
            status:
              normalizedResponse.status,
            statusText:
              normalizedResponse.statusText,
            code:
              normalizedResponse.code,
            message:
              normalizedResponse.message,
          }
        );

        return normalizedResponse;
      } finally {
        runtime.validateInFlight =
          null;
      }
    })();

  return runtime.validateInFlight;
}

/* =========================================================
   ALIASES
========================================================= */

export async function activate(payload = {}, options = {}) {
  return activateAccount(
    payload,
    options
  );
}

export async function activation(payload = {}, options = {}) {
  return activateAccount(
    payload,
    options
  );
}

export async function confirmActivation(payload = {}, options = {}) {
  return activateAccount(
    payload,
    options
  );
}

export async function accountActivation(payload = {}, options = {}) {
  return activateAccount(
    payload,
    options
  );
}

export async function createUserActivation(payload = {}, options = {}) {
  return activateAccount(
    payload,
    options
  );
}

export async function firstUserActivation(payload = {}, options = {}) {
  return activateFirstUser(
    payload,
    options
  );
}

export async function activateInitialUser(payload = {}, options = {}) {
  return activateFirstUser(
    payload,
    options
  );
}

export async function validateActivateAccountToken(payload = {}, options = {}) {
  return validateActivationToken(
    payload,
    options
  );
}

export async function validateActivateToken(payload = {}, options = {}) {
  return validateActivationToken(
    payload,
    options
  );
}

export async function validateAccountActivationToken(payload = {}, options = {}) {
  return validateActivationToken(
    payload,
    options
  );
}

export async function activationValidate(payload = {}, options = {}) {
  return validateActivationToken(
    payload,
    options
  );
}

/* =========================================================
   DEBUG
========================================================= */

function sanitizeBodyForSnapshot(body = {}) {
  const output = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (
      PASSWORD_FIELD_NAMES.includes(key) ||
      TOKEN_FIELD_NAMES.includes(key)
    ) {
      output[key] =
        value ? "***" : value;
      continue;
    }

    output[key] =
      typeof value === "string"
        ? redactSafe(value)
        : value;
  }

  return output;
}

export function getActivationSnapshot() {
  return {
    version:
      ACTIVATION_MODULE_VERSION,

    activateEndpoint:
      getActivateAccountEndpoint(),

    activateEndpointCandidates:
      endpointCandidatesFor("activate"),

    activateFirstUserEndpoint:
      getActivateFirstUserEndpoint(),

    activateFirstUserEndpointCandidates:
      endpointCandidatesFor("first-user"),

    validateEndpoint:
      getValidateActivationTokenEndpoint(),

    validateEndpointCandidates:
      endpointCandidatesFor("validate"),

    currentPath:
      redactSafe(
        getCurrentPath()
      ),

    hasTokenInCurrentUrl:
      Boolean(
        extractActivationTokenFromUrl()
      ),

    limits: {
      identifierMaxLength:
        getIdentifierMaxLength(),

      tokenMinLength:
        getTokenMinLength(),

      tokenMaxLength:
        getTokenMaxLength(),

      passwordMinLength:
        getPasswordMinLength(),

      passwordMaxLength:
        getPasswordMaxLength(),

      timeout:
        getRequestTimeout(),
    },

    runtime: {
      activateInFlight:
        Boolean(runtime.activateInFlight),

      firstUserInFlight:
        Boolean(runtime.firstUserInFlight),

      validateInFlight:
        Boolean(runtime.validateInFlight),

      lastActivateAt:
        runtime.lastActivateAt,

      lastFirstUserAt:
        runtime.lastFirstUserAt,

      lastValidateAt:
        runtime.lastValidateAt,

      activateCount:
        runtime.activateCount,

      firstUserCount:
        runtime.firstUserCount,

      validateCount:
        runtime.validateCount,

      lastError:
        runtime.lastError
          ? safeClone(runtime.lastError, null)
          : null,

      lastResult:
        runtime.lastResult
          ? safeClone(runtime.lastResult, null)
          : null,
    },

    transports: {
      hasHttpService:
        Boolean(
          AppCore?.http ||
          AppCore?.Http ||
          AppCore?.services?.http ||
          AppCore?.services?.Http
        ),

      hasApiClient:
        Boolean(AppCore?.apiClient),

      hasAppCoreRequest:
        isFunction(AppCore?.request),

      hasFetch:
        typeof fetch === "function",
    },

    at:
      isoNow(),
  };
}

export function getActivationDebugPayload(payload = {}) {
  return {
    activate:
      sanitizeBodyForSnapshot(
        buildActivateAccountBody(payload)
      ),

    firstUser:
      sanitizeBodyForSnapshot(
        buildActivateFirstUserBody(payload)
      ),

    validate:
      sanitizeBodyForSnapshot(
        buildValidateActivationTokenBody(payload)
      ),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const Activation =
  Object.assign(
    activateAccount,
    {
      version:
        ACTIVATION_MODULE_VERSION,

      activateAccount,
      activate,
      activation,
      confirmActivation,
      accountActivation,
      createUserActivation,

      activateFirstUser,
      firstUserActivation,
      activateInitialUser,

      validateActivationToken,
      validateActivateAccountToken,
      validateActivateToken,
      validateAccountActivationToken,
      activationValidate,

      resolveActivationToken,
      extractActivationToken,

      normalizeActivationPayload,
      normalizeActivateAccountPayload,
      normalizeFirstUserActivationPayload,
      normalizeValidateActivationTokenPayload,

      buildActivateAccountBody,
      buildActivationRequestBody,
      buildActivateFirstUserBody,
      buildFirstUserActivationBody,
      buildValidateActivationTokenBody,

      normalizeActivationResponse,
      normalizeActivateAccountResponse,
      normalizeFirstUserActivationResponse,
      normalizeValidateActivationTokenResponse,

      getActivateAccountEndpoint,
      getActivationEndpoint,
      getAccountActivationEndpoint,
      getActivateFirstUserEndpoint,
      getFirstUserActivationEndpoint,
      getValidateActivationTokenEndpoint,
      getValidateActivateAccountTokenEndpoint,
      getValidateActivateTokenEndpoint,
      getValidateAccountActivationTokenEndpoint,

      getActivationSnapshot,
      getActivationDebugPayload,
    }
  );

export default Activation;

/* =========================================================
   Onion SPA - Auth 2FA
   Archivo: src/features/auth/2fa.js

   AUTH 2FA · FINAL SIMPLE
   - Flujo público 2FA/MFA/OTP
   - Resuelve tempToken desde payload/storage/URL
   - Verifica código vía CoreHttp
   - Aplica sesión sólo con token + user
   - Limpia tempToken al completar sesión
   - Sin fetch propio, apiClient propio, Router, Toast ni refresh
========================================================= */

import CoreHttp from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  AUTH_ENDPOINT_CANDIDATES,
  AUTH_CONSTANTS,
  AUTH_TOKEN_PARAM_NAMES,
  getTwoFactorLoginEndpoint as getTwoFactorLoginEndpointFromConstants,
  getTwoFactorRequestEndpoint as getTwoFactorRequestEndpointFromConstants,
  getTwoFactorResendEndpoint as getTwoFactorResendEndpointFromConstants,
} from "./constants.js";

import {
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
  getStoredTempToken,
  persistTempToken,
} from "./storage.js";

import {
  applySession,
} from "./session.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const TWO_FACTOR_MODULE_VERSION = "20.0.0-final";

const SOURCE = "auth.2fa";

const DEFAULT_VERIFY_ENDPOINTS = Object.freeze([
  "/auth/2fa/login",
  "/auth/mfa/login",
  "/auth/otp/login",
  "/auth/2fa/verify",
  "/auth/mfa/verify",
  "/auth/otp/verify",
]);

const DEFAULT_REQUEST_ENDPOINTS = Object.freeze([
  "/auth/2fa/request",
  "/auth/mfa/request",
  "/auth/otp/request",
]);

const DEFAULT_RESEND_ENDPOINTS = Object.freeze([
  "/auth/2fa/resend",
  "/auth/mfa/resend",
  "/auth/otp/resend",
]);

const DEFAULT_2FA_PATH = "/2fa";
const DEFAULT_HOME_PATH = "/";

const SUCCESS_STATUS_TEXTS = new Set([
  "ok",
  "success",
  "succeeded",
  "accepted",
  "valid",
  "verified",
  "authenticated",
  "completed",
  "done",
]);

const FAILURE_STATUS_TEXTS = new Set([
  "error",
  "failed",
  "failure",
  "invalid",
  "unauthorized",
  "forbidden",
  "expired",
  "token_expired",
  "token_invalid",
  "code_expired",
  "code_invalid",
  "otp_invalid",
  "totp_invalid",
  "mfa_failed",
  "2fa_failed",
  "rate_limited",
  "too_many_requests",
]);

const FAILURE_CODES = new Set([
  "INVALID_TOKEN",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "TEMP_TOKEN_INVALID",
  "TEMP_TOKEN_EXPIRED",
  "MISSING_TEMP_TOKEN",
  "MISSING_2FA_TEMP_TOKEN",
  "MISSING_CODE",
  "INVALID_CODE",
  "CODE_INVALID",
  "CODE_EXPIRED",
  "OTP_INVALID",
  "OTP_EXPIRED",
  "TOTP_INVALID",
  "TOTP_EXPIRED",
  "MFA_FAILED",
  "TWO_FACTOR_FAILED",
  "RATE_LIMITED",
  "TOO_MANY_REQUESTS",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

const BAD_TEXT_VALUES = new Set([
  "",
  "undefined",
  "null",
  "false",
  "true",
  "none",
  "nan",
  "[object object]",
  "{}",
  "[]",
  "\"undefined\"",
  "\"null\"",
  "\"false\"",
  "\"true\"",
  "\"\"",
  "''",
]);

const TEMP_TOKEN_FIELD_NAMES = Object.freeze([
  "tempToken",
  "temp_token",
  "temporaryToken",
  "temporary_token",
  "challengeToken",
  "challenge_token",
  "twoFactorToken",
  "two_factor_token",
  "mfaToken",
  "mfa_token",
  "otpToken",
  "otp_token",
  "token",
]);

const CODE_FIELD_NAMES = Object.freeze([
  "code",
  "otp",
  "totp",
  "mfaCode",
  "mfa_code",
  "twoFactorCode",
  "two_factor_code",
  "verificationCode",
  "verification_code",
]);

const NEXT_ENDPOINT_STATUSES = new Set([404, 405, 410, 501]);

const runtime = {
  verifyInFlight: null,
  requestInFlight: null,
  resendInFlight: null,
  lastVerifyAt: 0,
  lastRequestAt: 0,
  lastResendAt: 0,
  verifyCount: 0,
  requestCount: 0,
  resendCount: 0,
  failCount: 0,
  cooldownUntil: 0,
  lastError: null,
  lastResult: null,
};

/* =========================================================
   BASICS
========================================================= */

const isBrowser = () => typeof window !== "undefined" && typeof document !== "undefined";
const isFunction = (value) => typeof value === "function";
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function safeObject(value, fallback = {}) {
  return isObject(value) ? value : fallback;
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value === null || value === undefined) return [];
  return [value];
}

function safeText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || fallback;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeBool(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === 1) return true;
  if (value === 0) return false;

  const text = safeText(value, "").toLowerCase();
  if (["true", "1", "yes", "si", "sí", "ok", "on", "enabled", "active"].includes(text)) return true;
  if (["false", "0", "no", "off", "disabled", "inactive"].includes(text)) return false;

  return Boolean(fallback);
}

function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = safeNumber(value, min);
  return Math.min(Math.max(number, min), max);
}

function unique(values = []) {
  return [
    ...new Set(
      safeArray(values)
        .flat(Infinity)
        .map((item) => safeText(item, ""))
        .filter(Boolean)
    ),
  ];
}

function first(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }

  return null;
}

function pickText(...values) {
  return safeText(first(...values), "");
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

function isBadText(value = "") {
  return BAD_TEXT_VALUES.has(safeText(value, "").toLowerCase());
}

/* =========================================================
   REDACTION / EVENTS
========================================================= */

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(/([?&#](?:token|tempToken|temp_token|temporaryToken|temporary_token|challengeToken|challenge_token|twoFactorToken|two_factor_token|mfaToken|mfa_token|otpToken|otp_token|code|otp|totp|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(\/(?:2fa|otp|mfa)\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  }
}

function sanitizeEventPayload(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  const key = safeText(keyHint, "").toLowerCase();

  if (/token|authorization|password|secret|credential|cookie|jwt|bearer|refresh|access|otp|totp|mfa|2fa|code/.test(key)) {
    return value ? "***" : value;
  }

  if (typeof value === "string") return redactSafe(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeEventPayload(item, depth + 1, keyHint));

  if (isObject(value)) {
    const output = {};

    for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
      output[childKey] = sanitizeEventPayload(childValue, depth + 1, childKey);
    }

    return output;
  }

  return redactSafe(String(value));
}

function safeEmit(eventName = "", payload = {}, options = {}) {
  if (options.emit === false || options.emitEvents === false || options.silentEvents === true) return false;

  const name = safeText(eventName, "");
  if (!name) return false;

  const detail = sanitizeEventPayload({
    source: SOURCE,
    version: TWO_FACTOR_MODULE_VERSION,
    at: isoNow(),
    ...safeObject(payload),
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      document.dispatchEvent(new CustomEvent(name, { detail, bubbles: false, cancelable: false }));
      return true;
    }
  } catch {}

  return false;
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[Auth2FA]", ...args.map((item) => sanitizeEventPayload(item)));
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[Auth2FA]", ...args.map((item) => sanitizeEventPayload(item)));
  } catch {}
}

/* =========================================================
   LIMITS
========================================================= */

function getCodeMinLength() {
  return clampNumber(AUTH_CONSTANTS?.twoFactorCodeMinLength ?? 4, 1, 64);
}

function getCodeMaxLength() {
  return clampNumber(AUTH_CONSTANTS?.twoFactorCodeMaxLength ?? 12, getCodeMinLength(), 128);
}

function getTokenMinLength() {
  return clampNumber(AUTH_CONSTANTS?.tempTokenMinLength ?? AUTH_CONSTANTS?.tokenMinLength ?? 8, 1, 4096);
}

function getTokenMaxLength() {
  return clampNumber(AUTH_CONSTANTS?.tempTokenMaxLength ?? AUTH_CONSTANTS?.tokenMaxLength ?? 8192, getTokenMinLength(), 32768);
}

function getRequestTimeout(options = {}) {
  const explicit = options.timeout ?? options.timeoutMs ?? options.twoFactorTimeoutMs;
  if (explicit !== undefined) return clampNumber(explicit, 1000, 120000);
  return clampNumber(AUTH_CONSTANTS?.authPublicTimeoutMs ?? AUTH_CONSTANTS?.requestTimeout ?? 15000, 1000, 120000);
}

function getCooldownMs() {
  return clampNumber(AUTH_CONSTANTS?.twoFactorCooldownMs ?? 30000, 0, 600000);
}

function getMaxAttempts() {
  return clampNumber(AUTH_CONSTANTS?.twoFactorMaxAttempts ?? 5, 1, 50);
}

/* =========================================================
   ENDPOINTS
========================================================= */

function normalizeAuthEndpoint(endpoint = "", fallback = "/auth/2fa/login") {
  const raw = safeText(endpoint, fallback);

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/auth/")) return raw;
  if (raw.startsWith("/")) return `/auth${raw}`;
  return `/auth/${raw}`;
}

function getConfiguredVerifyEndpoint() {
  return normalizeAuthEndpoint(
    pickText(
      isFunction(getTwoFactorLoginEndpointFromConstants) ? getTwoFactorLoginEndpointFromConstants() : "",
      AUTH_ENDPOINTS?.twoFactorLogin,
      AUTH_ENDPOINTS?.login2fa,
      AUTH_ENDPOINTS?.mfaLogin,
      AUTH_ENDPOINTS?.otpLogin,
      AUTH_ENDPOINTS?.verify2FA,
      AUTH_ENDPOINTS?.verifyMfa,
      AUTH_ENDPOINTS?.verifyOtp,
      AUTH_ENDPOINTS?.twoFactorVerify,
      DEFAULT_VERIFY_ENDPOINTS[0]
    ),
    DEFAULT_VERIFY_ENDPOINTS[0]
  );
}

function getConfiguredRequestEndpoint() {
  return normalizeAuthEndpoint(
    pickText(
      isFunction(getTwoFactorRequestEndpointFromConstants) ? getTwoFactorRequestEndpointFromConstants() : "",
      AUTH_ENDPOINTS?.twoFactorRequest,
      AUTH_ENDPOINTS?.request2FA,
      AUTH_ENDPOINTS?.requestMfa,
      AUTH_ENDPOINTS?.requestOtp,
      AUTH_ENDPOINTS?.send2FA,
      AUTH_ENDPOINTS?.sendMfa,
      AUTH_ENDPOINTS?.sendOtp,
      DEFAULT_REQUEST_ENDPOINTS[0]
    ),
    DEFAULT_REQUEST_ENDPOINTS[0]
  );
}

function getConfiguredResendEndpoint() {
  return normalizeAuthEndpoint(
    pickText(
      isFunction(getTwoFactorResendEndpointFromConstants) ? getTwoFactorResendEndpointFromConstants() : "",
      AUTH_ENDPOINTS?.twoFactorResend,
      AUTH_ENDPOINTS?.resend2FA,
      AUTH_ENDPOINTS?.resendMfa,
      AUTH_ENDPOINTS?.resendOtp,
      DEFAULT_RESEND_ENDPOINTS[0]
    ),
    DEFAULT_RESEND_ENDPOINTS[0]
  );
}

function endpointCandidatesFor(type = "verify") {
  if (type === "request") {
    return unique([getConfiguredRequestEndpoint(), ...safeArray(AUTH_ENDPOINT_CANDIDATES?.twoFactorRequest), ...DEFAULT_REQUEST_ENDPOINTS].map((item) => normalizeAuthEndpoint(item, DEFAULT_REQUEST_ENDPOINTS[0])));
  }

  if (type === "resend") {
    return unique([getConfiguredResendEndpoint(), ...safeArray(AUTH_ENDPOINT_CANDIDATES?.twoFactorResend), ...DEFAULT_RESEND_ENDPOINTS].map((item) => normalizeAuthEndpoint(item, DEFAULT_RESEND_ENDPOINTS[0])));
  }

  return unique([getConfiguredVerifyEndpoint(), ...safeArray(AUTH_ENDPOINT_CANDIDATES?.twoFactorLogin), ...DEFAULT_VERIFY_ENDPOINTS].map((item) => normalizeAuthEndpoint(item, DEFAULT_VERIFY_ENDPOINTS[0])));
}

export function getTwoFactorLoginEndpoint() {
  return getConfiguredVerifyEndpoint();
}

export function getTwoFactorVerifyEndpoint() {
  return getConfiguredVerifyEndpoint();
}

export function getMfaVerifyEndpoint() {
  return getConfiguredVerifyEndpoint();
}

export function getOtpVerifyEndpoint() {
  return getConfiguredVerifyEndpoint();
}

export function getTwoFactorRequestEndpoint() {
  return getConfiguredRequestEndpoint();
}

export function getTwoFactorResendEndpoint() {
  return getConfiguredResendEndpoint();
}

/* =========================================================
   URL / TEMP TOKEN
========================================================= */

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "/";
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathnameOnly(pathname = "/") {
  let value = safeText(pathname, "/").replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!value) value = "/";
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1 && value.endsWith("/")) value = value.replace(/\/+$/g, "") || "/";
  return value;
}

function getCurrentPath() {
  if (!isBrowser()) return "";

  try {
    const pathname = window.location.pathname || "/";
    const search = window.location.search || "";
    const hash = window.location.hash || "";
    if (hash && isHashRouterPath(hash)) return normalizeHashRouterPath(hash);
    return `${pathname}${search}${hash}`;
  } catch {
    return "";
  }
}

function pathFromUrlLike(value = "") {
  const raw = safeText(value, "");
  if (!raw) return "";
  if (isHashRouterPath(raw)) return normalizeHashRouterPath(raw);

  try {
    const parsed = new URL(raw, "http://localhost");
    if (parsed.hash && isHashRouterPath(parsed.hash)) return normalizeHashRouterPath(parsed.hash);
    return `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`;
  } catch {
    return raw.startsWith("/") || raw.startsWith("#") ? raw : `/${raw}`;
  }
}

function splitPath(path = "") {
  const raw = safeText(path, "/");
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");
  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || "/";
  }

  const searchIndex = pathname.indexOf("?");
  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || "/";
  }

  return { pathname, search, hash };
}

function getTokenParamNames() {
  const names = AUTH_TOKEN_PARAM_NAMES?.twoFactor;
  if (Array.isArray(names) && names.length) return names;

  return [
    "tempToken",
    "temp_token",
    "temporaryToken",
    "temporary_token",
    "challengeToken",
    "challenge_token",
    "twoFactorToken",
    "two_factor_token",
    "mfaToken",
    "mfa_token",
    "otpToken",
    "otp_token",
    "token",
    "t",
  ];
}

function normalizeTempTokenValue(value = "") {
  const raw = safeText(value, "");
  if (!raw || isBadText(raw)) return "";

  const token = raw.replace(/^bearer\s+/i, "").trim();
  if (!token || isBadText(token) || /[\r\n\t\s]/.test(token)) return "";
  if (token.length > getTokenMaxLength()) return "";

  return token;
}

function extractTempTokenFromSearch(search = "", names = getTokenParamNames()) {
  try {
    const params = new URLSearchParams(search || "");

    for (const name of names) {
      const token = normalizeTempTokenValue(params.get(name));
      if (token) return token;
    }
  } catch {}

  return "";
}

function extractTempTokenFromPath(path = "") {
  const pathname = normalizePathnameOnly(splitPath(pathFromUrlLike(path)).pathname);

  for (const route of ["/2fa", "/otp", "/mfa"]) {
    if (!pathname.startsWith(`${route}/`)) continue;

    const rawToken = pathname.slice(`${route}/`.length).split("/")[0];

    try {
      return normalizeTempTokenValue(decodeURIComponent(rawToken || ""));
    } catch {
      return normalizeTempTokenValue(rawToken);
    }
  }

  return "";
}

function extractTempTokenFromHashQuery(hash = "", names = getTokenParamNames()) {
  const cleanHash = safeText(hash, "");
  if (!cleanHash || !cleanHash.includes("?")) return "";

  const query = cleanHash.split("?").slice(1).join("?");
  return extractTempTokenFromSearch(query ? `?${query}` : "", names);
}

function extractTempTokenFromUrl(pathOrUrl = getCurrentPath()) {
  const raw = safeText(pathOrUrl, "");
  if (!raw) return "";

  const normalized = isHashRouterPath(raw) ? normalizeHashRouterPath(raw) : pathFromUrlLike(raw);
  const pathToken = extractTempTokenFromPath(normalized);
  if (pathToken) return pathToken;

  const { search, hash } = splitPath(normalized);
  const fromSearch = extractTempTokenFromSearch(search, getTokenParamNames());
  if (fromSearch) return fromSearch;

  if (hash && isHashRouterPath(hash)) {
    const hashPath = normalizeHashRouterPath(hash);
    const hashPathToken = extractTempTokenFromPath(hashPath);
    if (hashPathToken) return hashPathToken;

    const hashParts = splitPath(hashPath);
    const hashQueryToken = extractTempTokenFromSearch(hashParts.search, getTokenParamNames());
    if (hashQueryToken) return hashQueryToken;
  }

  return extractTempTokenFromHashQuery(hash, getTokenParamNames());
}

export function resolveTwoFactorTempToken(payload = {}) {
  return normalizeTempTokenValue(
    payload?.tempToken ??
      payload?.temp_token ??
      payload?.temporaryToken ??
      payload?.temporary_token ??
      payload?.challengeToken ??
      payload?.challenge_token ??
      payload?.twoFactorToken ??
      payload?.two_factor_token ??
      payload?.mfaToken ??
      payload?.mfa_token ??
      payload?.otpToken ??
      payload?.otp_token ??
      payload?.token ??
      getStoredTempToken() ??
      extractTempTokenFromUrl()
  );
}

/* =========================================================
   INPUT NORMALIZATION
========================================================= */

function normalizeCodeValue(value = "") {
  const code = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, getCodeMaxLength() + 1);

  return isBadText(code) ? "" : code;
}

function resolveTwoFactorCode(payload = {}) {
  return normalizeCodeValue(
    payload?.code ??
      payload?.otp ??
      payload?.totp ??
      payload?.mfaCode ??
      payload?.mfa_code ??
      payload?.twoFactorCode ??
      payload?.two_factor_code ??
      payload?.verificationCode ??
      payload?.verification_code ??
      ""
  );
}

function normalizeIdentifier(value = "") {
  const text = safeText(value, "").normalize("NFKC").replace(/\s+/g, " ").slice(0, 160);
  return isBadText(text) ? "" : text;
}

function resolveIdentifier(payload = {}) {
  return safeText(payload?.identifier ?? payload?.login ?? payload?.email ?? payload?.username ?? payload?.user ?? payload?.phone ?? payload?.telefono ?? payload?.mobile ?? "", "");
}

function normalizeRedirect(value = "", fallback = "") {
  const raw = safeText(value, "");
  if (!raw) return fallback;

  try {
    return sanitizeRedirectPath(raw, fallback || "");
  } catch {
    if (!raw.startsWith("/") || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
    if (/[\r\n\t\\]/.test(raw)) return fallback;
    return raw.replace(/\/{2,}/g, "/") || fallback;
  }
}

export function normalizeTwoFactorPayload(payload = {}) {
  const identifier = normalizeIdentifier(resolveIdentifier(payload));
  const method = safeText(payload?.method ?? payload?.channel ?? payload?.type ?? "", "").slice(0, 32);

  return {
    tempToken: resolveTwoFactorTempToken(payload),
    code: resolveTwoFactorCode(payload),
    identifier,
    method,
    redirect: normalizeRedirect(payload?.redirect ?? payload?.redirectTo ?? payload?.returnTo ?? "", ""),
    remember: safeBool(payload?.remember, false),
    trustDevice: safeBool(payload?.trustDevice ?? payload?.trust_device ?? payload?.rememberDevice ?? payload?.remember_device, false),
  };
}

export function normalizeVerifyTwoFactorPayload(payload = {}) {
  return normalizeTwoFactorPayload(payload);
}

export function normalizeRequestTwoFactorPayload(payload = {}) {
  const identifier = normalizeIdentifier(resolveIdentifier(payload));
  const method = safeText(payload?.method ?? payload?.channel ?? payload?.type ?? "", "").slice(0, 32);

  return {
    tempToken: resolveTwoFactorTempToken(payload),
    identifier,
    method,
  };
}

/* =========================================================
   BODY BUILDERS
========================================================= */

function stripEmptyValues(object = {}) {
  const output = {};

  for (const [key, value] of Object.entries(object)) {
    if (value === null || value === undefined || value === "") continue;
    output[key] = value;
  }

  return output;
}

export function buildTwoFactorVerifyBody(payload = {}) {
  const normalized = normalizeTwoFactorPayload(payload);

  return stripEmptyValues({
    tempToken: normalized.tempToken,
    temp_token: normalized.tempToken,
    twoFactorToken: normalized.tempToken,
    two_factor_token: normalized.tempToken,
    mfaToken: normalized.tempToken,
    mfa_token: normalized.tempToken,
    otpToken: normalized.tempToken,
    otp_token: normalized.tempToken,
    token: normalized.tempToken,

    code: normalized.code,
    otp: normalized.code,
    totp: normalized.code,
    mfaCode: normalized.code,
    mfa_code: normalized.code,
    twoFactorCode: normalized.code,
    two_factor_code: normalized.code,
    verificationCode: normalized.code,
    verification_code: normalized.code,

    identifier: normalized.identifier,
    login: normalized.identifier,
    email: normalized.identifier.includes("@") ? normalized.identifier : undefined,
    username: normalized.identifier && !normalized.identifier.includes("@") ? normalized.identifier : undefined,

    method: normalized.method,
    channel: normalized.method,
    remember: normalized.remember,
    rememberMe: normalized.remember,
    remember_me: normalized.remember,
    trustDevice: normalized.trustDevice,
    trust_device: normalized.trustDevice,
    rememberDevice: normalized.trustDevice,
    remember_device: normalized.trustDevice,
    redirect: normalized.redirect,
    redirectTo: normalized.redirect,
    returnTo: normalized.redirect,
  });
}

export function buildVerifyTwoFactorBody(payload = {}) {
  return buildTwoFactorVerifyBody(payload);
}

export function buildTwoFactorRequestBody(payload = {}) {
  const normalized = normalizeRequestTwoFactorPayload(payload);

  return stripEmptyValues({
    tempToken: normalized.tempToken,
    temp_token: normalized.tempToken,
    twoFactorToken: normalized.tempToken,
    two_factor_token: normalized.tempToken,
    mfaToken: normalized.tempToken,
    mfa_token: normalized.tempToken,
    otpToken: normalized.tempToken,
    otp_token: normalized.tempToken,
    token: normalized.tempToken,
    identifier: normalized.identifier,
    login: normalized.identifier,
    email: normalized.identifier.includes("@") ? normalized.identifier : undefined,
    username: normalized.identifier && !normalized.identifier.includes("@") ? normalized.identifier : undefined,
    method: normalized.method,
    channel: normalized.method,
  });
}

export function buildRequestTwoFactorBody(payload = {}) {
  return buildTwoFactorRequestBody(payload);
}

export function buildResendTwoFactorBody(payload = {}) {
  return buildTwoFactorRequestBody(payload);
}

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function responseNodes(input = {}) {
  const root = safeObject(input);
  return [
    root,
    safeObject(root.data),
    safeObject(root.payload),
    safeObject(root.result),
    safeObject(root.body),
    safeObject(root.response),
    safeObject(root.response?.data),
    safeObject(root.auth),
    safeObject(root.authData),
    safeObject(root.session),
    safeObject(root.sessionData),
    safeObject(root.meta),
  ].filter(isObject);
}

function resolveExplicitOk(input = {}) {
  for (const node of responseNodes(input)) {
    for (const key of ["ok", "success", "valid", "accepted", "completed", "verified", "authenticated"]) {
      if (typeof node[key] === "boolean") return node[key];
    }
  }

  return null;
}

function resolveStatus(input = {}) {
  for (const node of responseNodes(input)) {
    const status = first(node.status, node.statusCode, node.status_code);
    if (status !== null && status !== undefined && status !== "") return safeNumber(status, 0);
  }

  return 0;
}

function normalizeStatusText(value = "") {
  const text = safeText(value, "").toLowerCase();
  if (!text) return "";
  if (Number.isFinite(Number(text))) return "";
  return text;
}

function resolveStatusText(input = {}) {
  for (const node of responseNodes(input)) {
    const text = normalizeStatusText(first(node.statusText, node.status_text, node.state, node.status, node.result, node.type));
    if (text) return text;
  }

  return "";
}

function resolveCode(input = {}) {
  for (const node of responseNodes(input)) {
    const code = pickText(node.code, node.errorCode, node.error_code, node.error);
    if (code) return code;
  }

  return "";
}

function resolveRetryAfter(input = {}) {
  for (const node of responseNodes(input)) {
    const seconds = safeNumber(first(node.retryAfter, node.retry_after, node.cooldownSeconds, node.cooldown_seconds, node.rateLimitSeconds, node.rate_limit_seconds), 0);
    if (seconds > 0) return seconds;
  }

  return 0;
}

function resolveMessage(input = {}, fallback = "") {
  for (const node of responseNodes(input)) {
    const message = pickText(node.message, node.mensaje, node.detail, node.description, node.error, node.title, node.reason, node.msg);
    if (message) return message;
  }

  return fallback;
}

function resolveRedirectTo(input = {}, fallback = "") {
  for (const node of responseNodes(input)) {
    const redirect = normalizeRedirect(pickText(node.redirectTo, node.redirect_to, node.redirect, node.next, node.nextPath, node.next_path, node.returnTo, node.return_to), "");
    if (redirect) return redirect;
  }

  return fallback;
}

function extractTempTokenFromResponse(input = {}) {
  for (const node of responseNodes(input)) {
    for (const key of TEMP_TOKEN_FIELD_NAMES) {
      const token = normalizeTempTokenValue(node?.[key]);
      if (token) return token;
    }
  }

  return "";
}

function isExplicitFailure(input = {}) {
  const explicitOk = resolveExplicitOk(input);
  if (explicitOk === false) return true;

  const status = resolveStatus(input);
  if (status >= 400) return true;

  const statusText = resolveStatusText(input);
  if (statusText && FAILURE_STATUS_TEXTS.has(statusText)) return true;

  const code = resolveCode(input).toUpperCase();
  return Boolean(code && FAILURE_CODES.has(code));
}

function isDeclaredSuccess(input = {}) {
  const explicitOk = resolveExplicitOk(input);
  if (explicitOk === true) return true;
  if (explicitOk === false) return false;

  const status = resolveStatus(input);
  if (status >= 200 && status < 300) return true;

  const statusText = resolveStatusText(input);
  return Boolean(statusText && SUCCESS_STATUS_TEXTS.has(statusText));
}

function hasValidReturnedUser(user = null) {
  return Boolean(user && isObject(user) && user.active !== false && (user.id || user.userId || user.user_id || user.email || user.username || user.phone || user.telefono));
}

function hasCompleteSession(input = {}) {
  const token = safeText(extractToken(input), "");
  const user = extractUser(input);
  return Boolean(token && hasValidReturnedUser(user));
}

function isCooldownResponse(input = {}) {
  const status = resolveStatus(input);
  const retryAfter = resolveRetryAfter(input);
  const code = resolveCode(input).toUpperCase();
  const statusText = resolveStatusText(input);

  return Boolean(
    status === 429 ||
      retryAfter > 0 ||
      code === "RATE_LIMITED" ||
      code === "TOO_MANY_REQUESTS" ||
      statusText === "rate_limited" ||
      statusText === "too_many_requests" ||
      responseNodes(input).some((node) => node.cooldown === true || node.rateLimited === true)
  );
}

function normalizeBaseResponse({ input = {}, successMessage = "", errorMessage = "", redirectFallback = "" } = {}) {
  const explicitFailure = isExplicitFailure(input);
  const cooldown = isCooldownResponse(input);
  const retryAfter = resolveRetryAfter(input);
  const sessionComplete = hasCompleteSession(input);
  const ok = explicitFailure ? false : isDeclaredSuccess(input) || sessionComplete;
  const token = extractToken(input);
  const refreshToken = extractRefreshToken(input);
  const tempToken = extractTempTokenFromResponse(input);
  const user = extractUser(input);
  const sessionData = normalizeSessionPayload(input);

  return {
    raw: input,
    ok,
    success: ok,
    error: !ok,
    verified: ok,
    authenticated: Boolean(sessionComplete),
    status: resolveStatus(input),
    statusText: resolveStatusText(input) || null,
    code: resolveCode(input) || null,
    explicitFailure,
    cooldown,
    rateLimited: cooldown,
    retryAfter,
    cooldownSeconds: retryAfter,
    message: resolveMessage(input, ok ? successMessage : cooldown ? "Espera un momento antes de volver a intentarlo." : errorMessage),
    redirectTo: resolveRedirectTo(input, redirectFallback),
    token: token || null,
    accessToken: token || null,
    access_token: token || null,
    refreshToken: refreshToken || null,
    refresh_token: refreshToken || null,
    tempToken: tempToken || null,
    temp_token: tempToken || null,
    user: user || null,
    usuario: user || null,
    me: user || null,
    session: sessionData || null,
    sessionData: sessionData || null,
    at: isoNow(),
  };
}

export function normalizeTwoFactorResponse(input = {}) {
  return normalizeBaseResponse({ input, successMessage: "Verificación completada correctamente.", errorMessage: "No se pudo verificar el código.", redirectFallback: DEFAULT_HOME_PATH });
}

export function normalizeVerifyTwoFactorResponse(input = {}) {
  return normalizeTwoFactorResponse(input);
}

export function normalizeRequestTwoFactorResponse(input = {}) {
  return normalizeBaseResponse({ input, successMessage: "Código solicitado correctamente.", errorMessage: "No se pudo solicitar el código.", redirectFallback: DEFAULT_2FA_PATH });
}

export function normalizeResendTwoFactorResponse(input = {}) {
  return normalizeBaseResponse({ input, successMessage: "Código reenviado correctamente.", errorMessage: "No se pudo reenviar el código.", redirectFallback: DEFAULT_2FA_PATH });
}

/* =========================================================
   TRANSPORT
========================================================= */

function publicRequestOptions(options = {}) {
  const timeout = getRequestTimeout(options);

  return {
    ...safeObject(options),
    public: true,
    auth: false,
    skipAuth: true,
    noAuthHeader: true,
    _skipAuthRefresh: true,
    skipAuthRefresh: true,
    noAutoRefresh: true,
    autoRefresh: false,
    noAutoLogout: true,
    autoLogout: false,
    retry: false,
    retries: 0,
    _skipRetry: true,
    skipRetry: true,
    silent: true,
    storeError: false,
    dedupe: false,
    timeout,
    timeoutMs: timeout,
    captureAuth: false,
    headers: {
      "X-Onion-Auth-Flow": "2fa",
      "X-Request-Source": SOURCE,
      ...safeObject(options.headers),
    },
  };
}

async function executeTwoFactorRequest(endpoint, body, options = {}) {
  if (!isFunction(CoreHttp?.post)) {
    const error = new Error("CoreHttp no disponible para 2FA.");
    error.status = 500;
    error.code = "CORE_HTTP_MISSING";
    throw error;
  }

  return CoreHttp.post(endpoint, body, publicRequestOptions(options));
}

function getErrorStatus(error = null) {
  return safeNumber(error?.status || error?.statusCode || error?.response?.status || error?.data?.status || error?.response?.data?.status || 0, 0);
}

function shouldTryNextEndpoint(error = null) {
  return NEXT_ENDPOINT_STATUSES.has(getErrorStatus(error));
}

async function executeWithCandidates(candidates = [], body = {}, options = {}) {
  const endpoints = unique(candidates);
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      return await executeTwoFactorRequest(endpoint, body, { ...safeObject(options), endpoint });
    } catch (error) {
      lastError = error;
      if (!shouldTryNextEndpoint(error)) throw error;
    }
  }

  throw lastError || new Error("No hay endpoint 2FA disponible.");
}

/* =========================================================
   VALIDATION / COOLDOWN
========================================================= */

function getRemainingCooldownSeconds() {
  return Math.max(0, Math.ceil((runtime.cooldownUntil - nowMs()) / 1000));
}

export function clearTwoFactorCooldown() {
  runtime.failCount = 0;
  runtime.cooldownUntil = 0;
  return true;
}

function buildCooldownResponse(message = "Espera un momento antes de volver a intentarlo.") {
  const retryAfter = getRemainingCooldownSeconds();

  return {
    ok: false,
    success: false,
    error: true,
    status: 429,
    code: "RATE_LIMITED",
    cooldown: true,
    rateLimited: true,
    retryAfter,
    cooldownSeconds: retryAfter,
    message,
    raw: { ok: false, status: 429, retryAfter, message },
    at: isoNow(),
  };
}

function registerVerifyFailure() {
  runtime.failCount += 1;
  if (runtime.failCount >= getMaxAttempts()) runtime.cooldownUntil = nowMs() + getCooldownMs();
}

function validateVerifyPayload(normalized = {}) {
  if (!normalized.tempToken) return "No se recibió token temporal de verificación.";
  if (normalized.tempToken.length < getTokenMinLength()) return "El token temporal no es válido.";
  if (!normalized.code) return "El código de verificación es obligatorio.";
  if (normalized.code.length < getCodeMinLength()) return `El código debe tener al menos ${getCodeMinLength()} caracteres.`;
  if (normalized.code.length > getCodeMaxLength()) return "El código de verificación es demasiado largo.";
  return "";
}

function validateRequestPayload(normalized = {}) {
  if (!normalized.tempToken && !normalized.identifier) return "No se recibió contexto para solicitar el código.";
  if (normalized.tempToken && normalized.tempToken.length < getTokenMinLength()) return "El token temporal no es válido.";
  return "";
}

/* =========================================================
   BOOKKEEPING / SESSION
========================================================= */

function normalizeTransportError(error = null, fallbackMessage = "No se pudo verificar el código.") {
  const status = safeNumber(error?.status ?? error?.statusCode ?? error?.response?.status ?? error?.data?.status ?? error?.response?.data?.status ?? 0, 0);
  const retryAfter = Math.max(0, safeNumber(error?.retryAfter ?? error?.retry_after ?? error?.cooldownSeconds ?? error?.cooldown_seconds ?? error?.data?.retryAfter ?? error?.data?.retry_after ?? error?.data?.cooldownSeconds ?? error?.data?.cooldown_seconds ?? error?.response?.data?.retryAfter ?? error?.response?.data?.retry_after ?? error?.response?.data?.cooldownSeconds ?? error?.response?.data?.cooldown_seconds ?? 0, 0));

  return {
    ok: false,
    success: false,
    error: true,
    status,
    statusText: error?.statusText || null,
    code: error?.code || error?.data?.code || error?.response?.data?.code || null,
    retryAfter,
    cooldownSeconds: retryAfter,
    cooldown: status === 429 || retryAfter > 0,
    rateLimited: status === 429 || retryAfter > 0,
    message: safeText(error?.data?.message ?? error?.data?.mensaje ?? error?.data?.error ?? error?.response?.data?.message ?? error?.response?.data?.mensaje ?? error?.response?.data?.error ?? error?.message, status === 429 || retryAfter > 0 ? "Espera un momento antes de volver a intentarlo." : fallbackMessage),
    data: error?.data || error?.response?.data || null,
    raw: error || null,
  };
}

function rememberError(type = "unknown", error = null) {
  runtime.lastError = {
    type,
    message: safeText(error?.message, ""),
    status: error?.status || 0,
    code: error?.code || null,
    at: isoNow(),
  };
}

function rememberResult(type = "unknown", result = {}) {
  runtime.lastResult = {
    type,
    ok: Boolean(result?.ok),
    authenticated: Boolean(result?.authenticated),
    status: result?.status || 0,
    statusText: result?.statusText || null,
    code: result?.code || null,
    cooldown: Boolean(result?.cooldown),
    retryAfter: result?.retryAfter || 0,
    at: isoNow(),
  };

  if (result?.ok) {
    runtime.failCount = 0;
    runtime.cooldownUntil = 0;
  }

  if (result?.cooldown && result?.retryAfter) runtime.cooldownUntil = nowMs() + result.retryAfter * 1000;
}

function clearTempTokenSafe() {
  try {
    persistTempToken(null);
  } catch {}

  return true;
}

function maybePersistReturnedTempToken(normalizedResponse = {}, source = "2fa") {
  const token = normalizeTempTokenValue(normalizedResponse?.tempToken || normalizedResponse?.temp_token || "");
  if (!token) return false;

  try {
    persistTempToken(token);
  } catch {}

  safeEmit("auth:2fa:temp-token-updated", { source, hasTempToken: true });
  return true;
}

function maybeApplyReturnedSession(normalizedResponse = {}, source = "2fa") {
  if (!normalizedResponse?.authenticated || !normalizedResponse?.token || !hasValidReturnedUser(normalizedResponse?.user)) return null;

  try {
    const snapshot = applySession({
      token: normalizedResponse.token,
      accessToken: normalizedResponse.token,
      access_token: normalizedResponse.token,
      refreshToken: normalizedResponse.refreshToken || null,
      refresh_token: normalizedResponse.refreshToken || null,
      user: normalizedResponse.user,
      usuario: normalizedResponse.user,
      me: normalizedResponse.user,
      account: normalizedResponse.user,
      profile: normalizedResponse.user,
      session: normalizedResponse.sessionData || normalizedResponse.session || null,
      sessionData: normalizedResponse.sessionData || normalizedResponse.session || null,
      authenticated: true,
      preserveExistingUser: false,
      source,
      eventMode: "login",
    });

    clearTempTokenSafe();
    safeEmit("auth:2fa:session-applied", { authenticated: Boolean(snapshot?.authenticated), hasUser: Boolean(snapshot?.user), role: snapshot?.role || null, source });

    return snapshot;
  } catch (error) {
    safeWarn("No se pudo aplicar sesión devuelta por 2FA.", error);
    return null;
  }
}

/* =========================================================
   ACTIONS
========================================================= */

export async function verifyTwoFactor(payload = {}, options = {}) {
  if (runtime.verifyInFlight) return runtime.verifyInFlight;

  if (getRemainingCooldownSeconds() > 0) return normalizeTwoFactorResponse(buildCooldownResponse());

  const normalized = normalizeTwoFactorPayload(payload);
  const validationError = validateVerifyPayload(normalized);

  if (validationError) return normalizeTwoFactorResponse({ ok: false, status: 400, message: validationError });

  const endpoints = endpointCandidatesFor("verify");
  const body = buildTwoFactorVerifyBody(normalized);

  runtime.verifyCount += 1;
  runtime.lastVerifyAt = nowMs();

  safeEmit("auth:2fa:verify:start", { endpoints, hasIdentifier: Boolean(normalized.identifier), trustDevice: Boolean(normalized.trustDevice), remember: Boolean(normalized.remember) }, options);

  runtime.verifyInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const normalizedResponse = normalizeTwoFactorResponse(raw);
      const sessionSnapshot = maybeApplyReturnedSession(normalizedResponse, "2fa:verify");
      const finalResponse = { ...normalizedResponse, sessionApplied: Boolean(sessionSnapshot) };

      if (finalResponse.ok && !finalResponse.authenticated && options.requireSession !== false) {
        finalResponse.ok = false;
        finalResponse.success = false;
        finalResponse.error = true;
        finalResponse.message = finalResponse.message || "La verificación no devolvió una sesión completa.";
      }

      if (finalResponse.ok && finalResponse.tempToken) maybePersistReturnedTempToken(finalResponse, "2fa:verify");
      if (!finalResponse.ok) registerVerifyFailure();

      rememberResult("verify", finalResponse);
      safeEmit("auth:2fa:verify:complete", { ok: finalResponse.ok, authenticated: finalResponse.authenticated, sessionApplied: finalResponse.sessionApplied, status: finalResponse.status, statusText: finalResponse.statusText, redirectTo: finalResponse.redirectTo }, options);

      return finalResponse;
    } catch (error) {
      registerVerifyFailure();
      rememberError("verify", error);

      const normalizedError = normalizeTransportError(error, "No se pudo verificar el código.");
      const normalizedResponse = normalizeTwoFactorResponse(normalizedError);

      rememberResult("verify:error", normalizedResponse);
      safeEmit("auth:2fa:verify:error", { status: normalizedResponse.status, statusText: normalizedResponse.statusText, code: normalizedResponse.code, message: normalizedResponse.message, cooldown: normalizedResponse.cooldown, retryAfter: normalizedResponse.retryAfter }, options);

      return normalizedResponse;
    } finally {
      runtime.verifyInFlight = null;
    }
  })();

  return runtime.verifyInFlight;
}

export async function requestTwoFactorCode(payload = {}, options = {}) {
  if (runtime.requestInFlight) return runtime.requestInFlight;

  const normalized = normalizeRequestTwoFactorPayload(payload);
  const validationError = validateRequestPayload(normalized);

  if (validationError) return normalizeRequestTwoFactorResponse({ ok: false, status: 400, message: validationError });

  const endpoints = endpointCandidatesFor("request");
  const body = buildTwoFactorRequestBody(normalized);

  runtime.requestCount += 1;
  runtime.lastRequestAt = nowMs();

  safeEmit("auth:2fa:request:start", { endpoints, hasIdentifier: Boolean(normalized.identifier), method: normalized.method || null }, options);

  runtime.requestInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const normalizedResponse = normalizeRequestTwoFactorResponse(raw);

      if (normalizedResponse.ok && normalizedResponse.tempToken) maybePersistReturnedTempToken(normalizedResponse, "2fa:request");

      rememberResult("request", normalizedResponse);
      safeEmit("auth:2fa:request:complete", { ok: normalizedResponse.ok, status: normalizedResponse.status, statusText: normalizedResponse.statusText, cooldown: normalizedResponse.cooldown, retryAfter: normalizedResponse.retryAfter, hasTempToken: Boolean(normalizedResponse.tempToken) }, options);

      return normalizedResponse;
    } catch (error) {
      rememberError("request", error);

      const normalizedError = normalizeTransportError(error, "No se pudo solicitar el código.");
      const normalizedResponse = normalizeRequestTwoFactorResponse(normalizedError);

      rememberResult("request:error", normalizedResponse);
      safeEmit("auth:2fa:request:error", { status: normalizedResponse.status, code: normalizedResponse.code, message: normalizedResponse.message }, options);

      return normalizedResponse;
    } finally {
      runtime.requestInFlight = null;
    }
  })();

  return runtime.requestInFlight;
}

export async function resendTwoFactorCode(payload = {}, options = {}) {
  if (runtime.resendInFlight) return runtime.resendInFlight;

  const normalized = normalizeRequestTwoFactorPayload(payload);
  const validationError = validateRequestPayload(normalized);

  if (validationError) return normalizeResendTwoFactorResponse({ ok: false, status: 400, message: validationError });

  const endpoints = endpointCandidatesFor("resend");
  const body = buildResendTwoFactorBody(normalized);

  runtime.resendCount += 1;
  runtime.lastResendAt = nowMs();

  safeEmit("auth:2fa:resend:start", { endpoints, hasIdentifier: Boolean(normalized.identifier), method: normalized.method || null }, options);

  runtime.resendInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const normalizedResponse = normalizeResendTwoFactorResponse(raw);

      if (normalizedResponse.ok && normalizedResponse.tempToken) maybePersistReturnedTempToken(normalizedResponse, "2fa:resend");

      rememberResult("resend", normalizedResponse);
      safeEmit("auth:2fa:resend:complete", { ok: normalizedResponse.ok, status: normalizedResponse.status, statusText: normalizedResponse.statusText, cooldown: normalizedResponse.cooldown, retryAfter: normalizedResponse.retryAfter, hasTempToken: Boolean(normalizedResponse.tempToken) }, options);

      return normalizedResponse;
    } catch (error) {
      rememberError("resend", error);

      const normalizedError = normalizeTransportError(error, "No se pudo reenviar el código.");
      const normalizedResponse = normalizeResendTwoFactorResponse(normalizedError);

      rememberResult("resend:error", normalizedResponse);
      safeEmit("auth:2fa:resend:error", { status: normalizedResponse.status, code: normalizedResponse.code, message: normalizedResponse.message }, options);

      return normalizedResponse;
    } finally {
      runtime.resendInFlight = null;
    }
  })();

  return runtime.resendInFlight;
}

/* =========================================================
   ALIASES
========================================================= */

export const verify2FA = verifyTwoFactor;
export const login2fa = verifyTwoFactor;
export const verifyMfa = verifyTwoFactor;
export const mfaLogin = verifyTwoFactor;
export const verifyOtp = verifyTwoFactor;
export const otpLogin = verifyTwoFactor;
export const twoFactorLogin = verifyTwoFactor;
export const twoFactorVerify = verifyTwoFactor;
export const submitTwoFactorCode = verifyTwoFactor;

export const request2FA = requestTwoFactorCode;
export const requestMfa = requestTwoFactorCode;
export const requestOtp = requestTwoFactorCode;
export const sendTwoFactorCode = requestTwoFactorCode;

export const resend2FA = resendTwoFactorCode;
export const resendMfa = resendTwoFactorCode;
export const resendOtp = resendTwoFactorCode;

/* =========================================================
   ROUTE HELPERS
========================================================= */

export function isTwoFactorRoute(path = getCurrentPath()) {
  const clean = normalizePathnameOnly(pathFromUrlLike(path).split("?")[0].split("#")[0] || "/");

  return clean === "/2fa" || clean.startsWith("/2fa/") || clean === "/otp" || clean.startsWith("/otp/") || clean === "/mfa" || clean.startsWith("/mfa/");
}

export function getTwoFactorRedirectPath(payload = {}) {
  return normalizeRedirect(payload?.redirect ?? payload?.redirectTo ?? payload?.returnTo ?? "", DEFAULT_2FA_PATH);
}

/* =========================================================
   DEBUG
========================================================= */

function sanitizeBodyForSnapshot(body = {}) {
  const output = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (CODE_FIELD_NAMES.includes(key) || TEMP_TOKEN_FIELD_NAMES.includes(key)) {
      output[key] = value ? "***" : value;
      continue;
    }

    output[key] = typeof value === "string" ? redactSafe(value) : value;
  }

  return output;
}

export function getTwoFactorSnapshot() {
  const storedTempToken = getStoredTempToken();

  return {
    version: TWO_FACTOR_MODULE_VERSION,
    verifyEndpoint: getTwoFactorVerifyEndpoint(),
    verifyEndpointCandidates: endpointCandidatesFor("verify"),
    requestEndpoint: getTwoFactorRequestEndpoint(),
    requestEndpointCandidates: endpointCandidatesFor("request"),
    resendEndpoint: getTwoFactorResendEndpoint(),
    resendEndpointCandidates: endpointCandidatesFor("resend"),
    currentPath: redactSafe(getCurrentPath()),
    isTwoFactorRoute: isTwoFactorRoute(),
    hasStoredTempToken: Boolean(storedTempToken),
    hasTempTokenInCurrentUrl: Boolean(extractTempTokenFromUrl()),
    publicRequestPolicy: {
      auth: false,
      public: true,
      skipAuth: true,
      noAuthHeader: true,
      skipAuthRefresh: true,
      noAutoRefresh: true,
      noAutoLogout: true,
      retry: false,
      retries: 0,
    },
    limits: {
      codeMinLength: getCodeMinLength(),
      codeMaxLength: getCodeMaxLength(),
      tempTokenMinLength: getTokenMinLength(),
      tempTokenMaxLength: getTokenMaxLength(),
      timeout: getRequestTimeout(),
      cooldownMs: getCooldownMs(),
      maxAttempts: getMaxAttempts(),
    },
    runtime: {
      verifyInFlight: Boolean(runtime.verifyInFlight),
      requestInFlight: Boolean(runtime.requestInFlight),
      resendInFlight: Boolean(runtime.resendInFlight),
      lastVerifyAt: runtime.lastVerifyAt,
      lastRequestAt: runtime.lastRequestAt,
      lastResendAt: runtime.lastResendAt,
      verifyCount: runtime.verifyCount,
      requestCount: runtime.requestCount,
      resendCount: runtime.resendCount,
      failCount: runtime.failCount,
      cooldownUntil: runtime.cooldownUntil,
      remainingCooldownSeconds: getRemainingCooldownSeconds(),
      lastError: runtime.lastError ? { ...runtime.lastError } : null,
      lastResult: runtime.lastResult ? { ...runtime.lastResult } : null,
    },
    transport: {
      hasCoreHttp: Boolean(CoreHttp?.post),
      ownFetch: false,
      ownApiClient: false,
      ownRouter: false,
      ownToast: false,
    },
    at: isoNow(),
  };
}

export function getTwoFactorDebugPayload(payload = {}) {
  return {
    verify: sanitizeBodyForSnapshot(buildTwoFactorVerifyBody(payload)),
    request: sanitizeBodyForSnapshot(buildTwoFactorRequestBody(payload)),
    resend: sanitizeBodyForSnapshot(buildResendTwoFactorBody(payload)),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const TwoFactor = Object.assign(verifyTwoFactor, {
  version: TWO_FACTOR_MODULE_VERSION,

  verifyTwoFactor,
  verify2FA,
  login2fa,
  verifyMfa,
  mfaLogin,
  verifyOtp,
  otpLogin,
  twoFactorLogin,
  twoFactorVerify,
  submitTwoFactorCode,

  requestTwoFactorCode,
  request2FA,
  requestMfa,
  requestOtp,
  sendTwoFactorCode,

  resendTwoFactorCode,
  resend2FA,
  resendMfa,
  resendOtp,

  clearTwoFactorCooldown,

  resolveTwoFactorTempToken,

  normalizeTwoFactorPayload,
  normalizeVerifyTwoFactorPayload,
  normalizeRequestTwoFactorPayload,

  buildTwoFactorVerifyBody,
  buildVerifyTwoFactorBody,
  buildTwoFactorRequestBody,
  buildRequestTwoFactorBody,
  buildResendTwoFactorBody,

  normalizeTwoFactorResponse,
  normalizeVerifyTwoFactorResponse,
  normalizeRequestTwoFactorResponse,
  normalizeResendTwoFactorResponse,

  getTwoFactorLoginEndpoint,
  getTwoFactorVerifyEndpoint,
  getMfaVerifyEndpoint,
  getOtpVerifyEndpoint,
  getTwoFactorRequestEndpoint,
  getTwoFactorResendEndpoint,

  isTwoFactorRoute,
  getTwoFactorRedirectPath,

  getTwoFactorSnapshot,
  getTwoFactorDebugPayload,
});

export default TwoFactor;

/* =========================================================
   Onion SPA - Auth Activation
   Archivo: src/features/auth/activation.js

   AUTH ACTIVATION · FINAL SIMPLE
   - Flujo público de activación
   - Token desde payload/query/path/hash-router
   - Transporte único vía CoreHttp
   - Aplica sesión sólo con token + user real
   - Sin fetch propio, apiClient propio, Router, Toast ni refresh
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  AUTH_ENDPOINT_CANDIDATES,
  AUTH_CONSTANTS,
  AUTH_TOKEN_PARAM_NAMES,
  getPublicAuthRequestOptions,
  getAuthPublicTimeoutMs,
  getActivateAccountEndpoint as getActivateAccountEndpointFromConstants,
  getActivateFirstUserEndpoint as getActivateFirstUserEndpointFromConstants,
  getValidateActivationTokenEndpoint as getValidateActivationTokenEndpointFromConstants,
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
  applySession,
} from "./session.js";

/* =========================================================
   VERSION / CONSTANTS
========================================================= */

export const ACTIVATION_MODULE_VERSION = "20.0.0-final";

const SOURCE = "auth.activation";

const DEFAULT_ACTIVATE_ENDPOINT = "/auth/activate";
const DEFAULT_ACTIVATE_LEGACY_ENDPOINT = "/auth/activate-account";
const DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT = "/auth/activate/first-user";
const DEFAULT_VALIDATE_ENDPOINT = "/auth/activate/validate";
const DEFAULT_VALIDATE_LEGACY_ENDPOINT = "/auth/activate-account/validate";

const DEFAULT_LOGIN_REDIRECT = "/login";
const DEFAULT_HOME_REDIRECT = "/";

const ACTIVATION_PATHS = Object.freeze([
  "/activate-account",
  "/activate",
  "/activation",
  "/account/activate",
  "/activate/first-user",
]);

const SUCCESS_STATUS_TEXTS = new Set([
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
  "activation_failed",
  "rate_limited",
  "too_many_requests",
]);

const FAILURE_CODES = new Set([
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

const NEXT_ENDPOINT_STATUSES = new Set([404, 405, 410, 501]);

const TOKEN_FIELD_NAMES = new Set([
  "token",
  "code",
  "t",
  "activationToken",
  "activateToken",
  "activation_token",
  "activate_token",
]);

const PASSWORD_FIELD_NAMES = new Set([
  "password",
  "newPassword",
  "new_password",
  "confirmPassword",
  "passwordConfirmation",
  "password_confirmation",
  "repeatPassword",
  "repeat_password",
]);

const runtime = {
  activateInFlight: null,
  firstUserInFlight: null,
  validateInFlight: null,
  lastActivateAt: 0,
  lastFirstUserAt: 0,
  lastValidateAt: 0,
  activateCount: 0,
  firstUserCount: 0,
  validateCount: 0,
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
   EVENTS / REDACTION
========================================================= */

function redactSafe(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(/([?&#](?:token|activationToken|activateToken|activation_token|activate_token|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(\/activate-account\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/activate\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  }
}

function sanitizeEventPayload(value, depth = 0, keyHint = "") {
  if (depth > 4) return "[depth-limit]";

  const key = safeText(keyHint, "").toLowerCase();

  if (/token|password|authorization|secret|credential|cookie|jwt|bearer|refresh|access|otp|totp|mfa|2fa|code/.test(key)) {
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
    version: ACTIVATION_MODULE_VERSION,
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
    AppCore?.utils?.warn?.("[Activation]", ...args.map((item) => sanitizeEventPayload(item)));
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[Activation]", ...args.map((item) => sanitizeEventPayload(item)));
  } catch {}
}

/* =========================================================
   LIMITS
========================================================= */

function getIdentifierMaxLength() {
  return clampNumber(AUTH_CONSTANTS?.identifierMaxLength ?? 160, 1, 512);
}

function getTokenMinLength() {
  return clampNumber(AUTH_CONSTANTS?.activationTokenMinLength ?? AUTH_CONSTANTS?.tokenMinLength ?? 8, 1, 4096);
}

function getTokenMaxLength() {
  return clampNumber(AUTH_CONSTANTS?.activationTokenMaxLength ?? AUTH_CONSTANTS?.tokenMaxLength ?? 8192, getTokenMinLength(), 32768);
}

function getPasswordMinLength() {
  return clampNumber(AUTH_CONSTANTS?.activationPasswordMinLength ?? AUTH_CONSTANTS?.passwordMinLength ?? 8, 1, 1024);
}

function getPasswordMaxLength() {
  return clampNumber(AUTH_CONSTANTS?.activationPasswordMaxLength ?? AUTH_CONSTANTS?.passwordMaxLength ?? 1024, getPasswordMinLength(), 8192);
}

function getRequestTimeout(options = {}) {
  const explicit = options.timeout ?? options.timeoutMs ?? options.activationTimeoutMs;
  if (explicit !== undefined) return clampNumber(explicit, 1000, 120000);

  try {
    const fromConstants = getAuthPublicTimeoutMs?.();
    if (fromConstants) return clampNumber(fromConstants, 1000, 120000);
  } catch {}

  return clampNumber(AUTH_CONSTANTS?.authPublicTimeoutMs ?? AUTH_CONSTANTS?.requestTimeout ?? 15000, 1000, 120000);
}

/* =========================================================
   ENDPOINTS
========================================================= */

function normalizeAuthEndpoint(endpoint = "", fallback = DEFAULT_ACTIVATE_ENDPOINT) {
  const raw = safeText(endpoint, fallback);

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/auth/")) return raw;
  if (raw.startsWith("/")) return `/auth${raw}`;
  return `/auth/${raw}`;
}

function getConfiguredActivateEndpoint() {
  return normalizeAuthEndpoint(
    pickText(
      isFunction(getActivateAccountEndpointFromConstants) ? getActivateAccountEndpointFromConstants() : "",
      DEFAULT_ACTIVATE_ENDPOINT
    ),
    DEFAULT_ACTIVATE_ENDPOINT
  );
}

function getConfiguredFirstUserEndpoint() {
  return normalizeAuthEndpoint(
    pickText(
      isFunction(getActivateFirstUserEndpointFromConstants) ? getActivateFirstUserEndpointFromConstants() : "",
      DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT
    ),
    DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT
  );
}

function getConfiguredValidateEndpoint() {
  return normalizeAuthEndpoint(
    pickText(
      isFunction(getValidateActivationTokenEndpointFromConstants) ? getValidateActivationTokenEndpointFromConstants() : "",
      DEFAULT_VALIDATE_ENDPOINT
    ),
    DEFAULT_VALIDATE_ENDPOINT
  );
}

function endpointCandidatesFor(type = "activate") {
  if (type === "first-user") {
    return unique([
      getConfiguredFirstUserEndpoint(),
      ...safeArray(AUTH_ENDPOINT_CANDIDATES?.activateFirstUser),
      DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT,
    ].map((item) => normalizeAuthEndpoint(item, DEFAULT_ACTIVATE_FIRST_USER_ENDPOINT)));
  }

  if (type === "validate") {
    return unique([
      getConfiguredValidateEndpoint(),
      ...safeArray(AUTH_ENDPOINT_CANDIDATES?.validateActivationToken),
      DEFAULT_VALIDATE_ENDPOINT,
      DEFAULT_VALIDATE_LEGACY_ENDPOINT,
    ].map((item) => normalizeAuthEndpoint(item, DEFAULT_VALIDATE_ENDPOINT)));
  }

  return unique([
    getConfiguredActivateEndpoint(),
    ...safeArray(AUTH_ENDPOINT_CANDIDATES?.activateAccount),
    DEFAULT_ACTIVATE_ENDPOINT,
    DEFAULT_ACTIVATE_LEGACY_ENDPOINT,
  ].map((item) => normalizeAuthEndpoint(item, DEFAULT_ACTIVATE_ENDPOINT)));
}

export function getActivateAccountEndpoint() {
  return getConfiguredActivateEndpoint();
}

export function getActivationEndpoint() {
  return getActivateAccountEndpoint();
}

export function getAccountActivationEndpoint() {
  return getActivateAccountEndpoint();
}

export function getActivateFirstUserEndpoint() {
  return getConfiguredFirstUserEndpoint();
}

export function getFirstUserActivationEndpoint() {
  return getActivateFirstUserEndpoint();
}

export function getValidateActivationTokenEndpoint() {
  return getConfiguredValidateEndpoint();
}

export function getValidateActivateAccountTokenEndpoint() {
  return getValidateActivationTokenEndpoint();
}

export function getValidateActivateTokenEndpoint() {
  return getValidateActivationTokenEndpoint();
}

export function getValidateAccountActivationTokenEndpoint() {
  return getValidateActivationTokenEndpoint();
}

/* =========================================================
   URL / TOKEN
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

function getTokenParamNames(type = "activation") {
  const names = AUTH_TOKEN_PARAM_NAMES?.[type];
  if (Array.isArray(names) && names.length) return names;

  return ["token", "activationToken", "activateToken", "activation_token", "activate_token", "code", "t"];
}

function normalizeActivationTokenValue(value = "") {
  const raw = safeText(value, "");
  if (!raw || isBadText(raw)) return "";

  const token = raw.replace(/^bearer\s+/i, "").trim();
  if (!token || isBadText(token) || /[\r\n\t\s]/.test(token)) return "";
  if (token.length > getTokenMaxLength()) return "";

  return token;
}

function extractTokenFromSearch(search = "", names = getTokenParamNames("activation")) {
  try {
    const params = new URLSearchParams(search || "");

    for (const name of names) {
      const token = normalizeActivationTokenValue(params.get(name));
      if (token) return token;
    }
  } catch {}

  return "";
}

function extractTokenFromPath(path = "") {
  const { pathname } = splitPath(pathFromUrlLike(path));

  for (const basePath of ACTIVATION_PATHS) {
    if (!pathname.startsWith(`${basePath}/`)) continue;

    const rawToken = pathname.slice(`${basePath}/`.length).split("/")[0];

    try {
      return normalizeActivationTokenValue(decodeURIComponent(rawToken || ""));
    } catch {
      return normalizeActivationTokenValue(rawToken);
    }
  }

  return "";
}

function extractTokenFromHashQuery(hash = "", names = getTokenParamNames("activation")) {
  const cleanHash = safeText(hash, "");
  if (!cleanHash || !cleanHash.includes("?")) return "";

  const query = cleanHash.split("?").slice(1).join("?");
  return extractTokenFromSearch(query ? `?${query}` : "", names);
}

function extractActivationTokenFromUrl(pathOrUrl = getCurrentPath()) {
  const raw = safeText(pathOrUrl, "");
  if (!raw) return "";

  const normalized = isHashRouterPath(raw) ? normalizeHashRouterPath(raw) : pathFromUrlLike(raw);
  const pathToken = extractTokenFromPath(normalized);
  if (pathToken) return pathToken;

  const { search, hash } = splitPath(normalized);
  const fromSearch = extractTokenFromSearch(search, getTokenParamNames("activation"));
  if (fromSearch) return fromSearch;

  if (hash && isHashRouterPath(hash)) {
    const hashPath = normalizeHashRouterPath(hash);
    const hashPathToken = extractTokenFromPath(hashPath);
    if (hashPathToken) return hashPathToken;

    const hashParts = splitPath(hashPath);
    const hashQueryToken = extractTokenFromSearch(hashParts.search, getTokenParamNames("activation"));
    if (hashQueryToken) return hashQueryToken;
  }

  return extractTokenFromHashQuery(hash, getTokenParamNames("activation"));
}

export function resolveActivationToken(payload = {}) {
  return normalizeActivationTokenValue(payload?.token ?? payload?.code ?? payload?.activationToken ?? payload?.activateToken ?? payload?.activation_token ?? payload?.activate_token ?? payload?.t ?? extractActivationTokenFromUrl());
}

export function extractActivationToken(value = getCurrentPath()) {
  return extractActivationTokenFromUrl(value);
}

/* =========================================================
   INPUT NORMALIZATION
========================================================= */

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

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeText(value, ""));
}

function looksLikePhone(value = "") {
  return /^\+?\d{6,20}$/.test(safeText(value, "").replace(/[^\d+]/g, ""));
}

function normalizeIdentifier(value = "") {
  const text = safeText(value, "").normalize("NFKC").replace(/\s+/g, " ");
  return isBadText(text) ? "" : text.slice(0, getIdentifierMaxLength() + 1);
}

function normalizeEmail(value = "") {
  return safeText(value, "").toLowerCase().slice(0, 254);
}

function normalizePhone(value = "") {
  return safeText(value, "").replace(/[^\d+]/g, "").slice(0, 32);
}

function normalizeUsername(value = "") {
  return safeText(value, "")
    .normalize("NFKC")
    .replace(/^@+/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/^[._-]+|[._-]+$/g, "")
    .toLowerCase()
    .slice(0, 80);
}

function normalizeName(value = "") {
  return safeText(value, "").normalize("NFKC").replace(/\s+/g, " ").slice(0, 160);
}

function normalizePassword(value = "") {
  if (value === null || value === undefined) return "";
  return String(value);
}

function resolveIdentifier(payload = {}) {
  return safeText(payload?.identifier ?? payload?.login ?? payload?.email ?? payload?.username ?? payload?.user ?? payload?.phone ?? payload?.telefono ?? payload?.mobile ?? "", "");
}

export function normalizeActivationPayload(payload = {}) {
  const identifier = normalizeIdentifier(resolveIdentifier(payload));
  const email = looksLikeEmail(identifier) ? normalizeEmail(identifier) : "";
  const phone = !email && looksLikePhone(identifier) ? normalizePhone(identifier) : "";
  const username = !email && !phone ? normalizeUsername(identifier) : "";

  return {
    token: resolveActivationToken(payload),
    password: normalizePassword(payload?.password ?? payload?.newPassword ?? payload?.new_password ?? ""),
    confirmPassword: normalizePassword(payload?.confirmPassword ?? payload?.passwordConfirmation ?? payload?.password_confirmation ?? payload?.repeatPassword ?? payload?.repeat_password ?? ""),
    identifier,
    email,
    phone,
    username,
    name: normalizeName(payload?.name ?? payload?.nombre ?? payload?.displayName ?? payload?.display_name ?? payload?.fullName ?? payload?.full_name ?? ""),
    redirect: normalizeRedirect(payload?.redirect ?? payload?.redirectTo ?? payload?.returnTo ?? DEFAULT_LOGIN_REDIRECT, DEFAULT_LOGIN_REDIRECT),
    lang: safeText(payload?.lang ?? payload?.language ?? AppCore?.state?.lang ?? AppCore?.config?.defaultLang ?? "es", "es").slice(0, 8),
  };
}

export function normalizeActivateAccountPayload(payload = {}) {
  return normalizeActivationPayload(payload);
}

export function normalizeFirstUserActivationPayload(payload = {}) {
  const base = normalizeActivationPayload(payload);
  const companyName = normalizeName(payload?.companyName ?? payload?.company ?? payload?.empresa ?? payload?.cliente ?? "");

  return { ...base, companyName, empresa: companyName };
}

export function normalizeValidateActivationTokenPayload(payload = {}) {
  return { token: resolveActivationToken(payload) };
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

export function buildActivateAccountBody(payload = {}) {
  const normalized = normalizeActivationPayload(payload);

  return stripEmptyValues({
    token: normalized.token,
    code: normalized.token,
    t: normalized.token,
    activationToken: normalized.token,
    activateToken: normalized.token,
    activation_token: normalized.token,
    activate_token: normalized.token,
    password: normalized.password,
    newPassword: normalized.password,
    new_password: normalized.password,
    confirmPassword: normalized.confirmPassword,
    passwordConfirmation: normalized.confirmPassword,
    password_confirmation: normalized.confirmPassword,
    repeatPassword: normalized.confirmPassword,
    repeat_password: normalized.confirmPassword,
    identifier: normalized.identifier,
    login: normalized.identifier,
    email: normalized.email,
    username: normalized.username,
    user: normalized.username,
    phone: normalized.phone,
    telefono: normalized.phone,
    name: normalized.name,
    nombre: normalized.name,
    displayName: normalized.name,
    display_name: normalized.name,
    redirect: normalized.redirect,
    redirectTo: normalized.redirect,
    returnTo: normalized.redirect,
    lang: normalized.lang,
    language: normalized.lang,
  });
}

export function buildActivationRequestBody(payload = {}) {
  return buildActivateAccountBody(payload);
}

export function buildActivateFirstUserBody(payload = {}) {
  const normalized = normalizeFirstUserActivationPayload(payload);

  return stripEmptyValues({
    ...buildActivateAccountBody(normalized),
    companyName: normalized.companyName,
    company: normalized.companyName,
    empresa: normalized.companyName,
  });
}

export function buildFirstUserActivationBody(payload = {}) {
  return buildActivateFirstUserBody(payload);
}

export function buildValidateActivationTokenBody(payload = {}) {
  const normalized = normalizeValidateActivationTokenPayload(payload);

  return stripEmptyValues({
    token: normalized.token,
    code: normalized.token,
    t: normalized.token,
    activationToken: normalized.token,
    activateToken: normalized.token,
    activation_token: normalized.token,
    activate_token: normalized.token,
  });
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
    safeObject(root.meta),
  ].filter((node) => Object.keys(node).length > 0);
}

function resolveExplicitOk(input = {}) {
  for (const node of responseNodes(input)) {
    for (const key of ["ok", "success", "valid", "accepted", "completed", "activated", "active"]) {
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

function resolveStatusText(input = {}) {
  for (const node of responseNodes(input)) {
    const text = safeText(first(node.statusText, node.status_text, node.state, node.status, node.result, node.type), "").toLowerCase();
    if (text && !Number.isFinite(Number(text))) return text;
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

function resolveMessage(input = {}, fallback = "") {
  for (const node of responseNodes(input)) {
    const nestedError = safeObject(node.error);
    const message = pickText(node.message, node.mensaje, nestedError.message, nestedError.mensaje, nestedError.detail, node.detail, node.description, typeof node.error === "string" ? node.error : "", node.title, node.reason, node.msg);
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

function resolveRetryAfter(input = {}) {
  for (const node of responseNodes(input)) {
    const seconds = safeNumber(first(node.retryAfter, node.retry_after, node.cooldownSeconds, node.cooldown_seconds, node.rateLimitSeconds, node.rate_limit_seconds), 0);
    if (seconds > 0) return seconds;
  }

  return 0;
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

  return Boolean(status === 429 || retryAfter > 0 || code === "RATE_LIMITED" || code === "TOO_MANY_REQUESTS" || statusText === "rate_limited" || statusText === "too_many_requests" || responseNodes(input).some((node) => node.cooldown === true || node.rateLimited === true));
}

function normalizeBaseResponse({ input = {}, successMessage = "", errorMessage = "", redirectFallback = "" } = {}) {
  const explicitFailure = isExplicitFailure(input);
  const cooldown = isCooldownResponse(input);
  const retryAfter = resolveRetryAfter(input);
  const sessionComplete = hasCompleteSession(input);
  const ok = explicitFailure ? false : isDeclaredSuccess(input) || sessionComplete;
  const token = extractToken(input);
  const refreshToken = extractRefreshToken(input);
  const user = extractUser(input);
  const sessionData = normalizeSessionPayload(input);

  return {
    raw: input,
    ok,
    success: ok,
    error: !ok,
    activated: ok,
    valid: ok,
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
    user: user || null,
    usuario: user || null,
    me: user || null,
    session: sessionData || null,
    sessionData: sessionData || null,
    at: isoNow(),
  };
}

export function normalizeActivationResponse(input = {}) {
  return normalizeBaseResponse({ input, successMessage: "La cuenta se ha activado correctamente.", errorMessage: "No se pudo activar la cuenta.", redirectFallback: DEFAULT_LOGIN_REDIRECT });
}

export function normalizeActivateAccountResponse(input = {}) {
  return normalizeActivationResponse(input);
}

export function normalizeFirstUserActivationResponse(input = {}) {
  return normalizeBaseResponse({ input, successMessage: "El primer usuario se ha activado correctamente.", errorMessage: "No se pudo activar el primer usuario.", redirectFallback: DEFAULT_HOME_REDIRECT });
}

export function normalizeValidateActivationTokenResponse(input = {}) {
  return normalizeBaseResponse({ input, successMessage: "El token de activación es válido.", errorMessage: "El token de activación no es válido.", redirectFallback: "" });
}

/* =========================================================
   TRANSPORT
========================================================= */

function publicRequestOptions(options = {}) {
  const timeout = getRequestTimeout(options);
  let publicOptions = {};

  try {
    publicOptions = getPublicAuthRequestOptions?.() || {};
  } catch {}

  return {
    ...publicOptions,
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
    captureAuth: false,
    timeout,
    timeoutMs: timeout,
    headers: {
      "X-Onion-Auth-Flow": "activation",
      "X-Request-Source": SOURCE,
      ...safeObject(options.headers),
    },
  };
}

async function executeActivationRequest(endpoint, body, options = {}) {
  if (!isFunction(CoreHttp?.post)) {
    const error = new Error("CoreHttp no disponible para activación.");
    error.status = 500;
    error.code = "CORE_HTTP_MISSING";
    throw error;
  }

  return CoreHttp.post(endpoint, body, publicRequestOptions(options));
}

function shouldTryNextEndpoint(error = null) {
  const status = safeNumber(error?.status || error?.statusCode || error?.response?.status || error?.data?.status || error?.response?.data?.status || 0, 0);
  return NEXT_ENDPOINT_STATUSES.has(status);
}

async function executeWithCandidates(candidates = [], body = {}, options = {}) {
  const endpoints = unique(candidates);
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      return await executeActivationRequest(endpoint, body, { ...safeObject(options), endpoint });
    } catch (error) {
      lastError = error;
      if (!shouldTryNextEndpoint(error)) throw error;
    }
  }

  throw lastError || new Error("No hay endpoint de activación disponible.");
}

/* =========================================================
   VALIDATION
========================================================= */

function validateActivationPayload(normalized = {}, options = {}) {
  if (!normalized.token) return "No se recibió token de activación.";
  if (normalized.token.length < getTokenMinLength()) return "El token de activación no es válido.";
  if (normalized.identifier && normalized.identifier.length > getIdentifierMaxLength()) return "El identificador es demasiado largo.";
  if (options.allowPasswordless === true) return "";
  if (!normalized.password) return "La contraseña es obligatoria.";
  if (normalized.password.length < getPasswordMinLength()) return `La contraseña debe tener al menos ${getPasswordMinLength()} caracteres.`;
  if (normalized.password.length > getPasswordMaxLength()) return "La contraseña es demasiado larga.";
  if (!normalized.confirmPassword) return "La confirmación de contraseña es obligatoria.";
  if (normalized.confirmPassword.length > getPasswordMaxLength()) return "La confirmación de contraseña es demasiado larga.";
  if (normalized.password !== normalized.confirmPassword) return "Las contraseñas no coinciden.";
  return "";
}

function validateFirstUserPayload(normalized = {}, options = {}) {
  if (options.allowTokenlessFirstUser !== true) {
    if (!normalized.token) return "No se recibió token de activación.";
    if (normalized.token.length < getTokenMinLength()) return "El token de activación no es válido.";
  }

  if (!normalized.identifier) return "No se recibió email, usuario o teléfono para activar el primer usuario.";
  if (normalized.identifier.length > getIdentifierMaxLength()) return "El identificador es demasiado largo.";
  if (!normalized.password) return "La contraseña es obligatoria.";
  if (normalized.password.length < getPasswordMinLength()) return `La contraseña debe tener al menos ${getPasswordMinLength()} caracteres.`;
  if (normalized.password.length > getPasswordMaxLength()) return "La contraseña es demasiado larga.";
  if (!normalized.confirmPassword) return "La confirmación de contraseña es obligatoria.";
  if (normalized.password !== normalized.confirmPassword) return "Las contraseñas no coinciden.";
  return "";
}

function validateTokenPayload(normalized = {}) {
  if (!normalized.token) return "No se recibió token de activación.";
  if (normalized.token.length < getTokenMinLength()) return "El token de activación no es válido.";
  return "";
}

/* =========================================================
   BOOKKEEPING / SESSION
========================================================= */

function normalizeTransportError(error = null, fallbackMessage = "No se pudo activar la cuenta.") {
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
}

function maybeApplyReturnedSession(normalizedResponse = {}, source = "activation") {
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
      eventMode: "activation",
    }, {
      source,
      eventMode: "activation",
      silent: true,
      emit: false,
    });

    safeEmit("auth:activation:session-applied", { authenticated: Boolean(snapshot?.authenticated), hasUser: Boolean(snapshot?.user), role: snapshot?.role || null, source });
    return snapshot;
  } catch (error) {
    safeWarn("No se pudo aplicar sesión devuelta por activación.", error);
    return null;
  }
}

/* =========================================================
   ACTIONS
========================================================= */

export async function activateAccount(payload = {}, options = {}) {
  if (runtime.activateInFlight) return runtime.activateInFlight;

  const normalized = normalizeActivationPayload(payload);
  const validationError = validateActivationPayload(normalized, options);

  if (validationError) return normalizeActivationResponse({ ok: false, status: 400, message: validationError });

  const endpoints = endpointCandidatesFor("activate");
  const body = buildActivateAccountBody(normalized);

  runtime.activateCount += 1;
  runtime.lastActivateAt = nowMs();

  safeEmit("auth:activation:start", { endpoints, hasPassword: Boolean(normalized.password), hasIdentifier: Boolean(normalized.identifier) }, options);

  runtime.activateInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const normalizedResponse = normalizeActivationResponse(raw);
      const sessionSnapshot = maybeApplyReturnedSession(normalizedResponse, "activation");
      const finalResponse = { ...normalizedResponse, sessionApplied: Boolean(sessionSnapshot) };

      rememberResult("activation", finalResponse);
      safeEmit("auth:activation:complete", { ok: finalResponse.ok, authenticated: finalResponse.authenticated, sessionApplied: finalResponse.sessionApplied, status: finalResponse.status, statusText: finalResponse.statusText, redirectTo: finalResponse.redirectTo }, options);

      return finalResponse;
    } catch (error) {
      rememberError("activation", error);

      const normalizedError = normalizeTransportError(error, "No se pudo activar la cuenta.");
      const normalizedResponse = normalizeActivationResponse(normalizedError);

      rememberResult("activation:error", normalizedResponse);
      safeEmit("auth:activation:error", { status: normalizedResponse.status, statusText: normalizedResponse.statusText, code: normalizedResponse.code, message: normalizedResponse.message }, options);

      return normalizedResponse;
    } finally {
      runtime.activateInFlight = null;
    }
  })();

  return runtime.activateInFlight;
}

export async function activateFirstUser(payload = {}, options = {}) {
  if (runtime.firstUserInFlight) return runtime.firstUserInFlight;

  const normalized = normalizeFirstUserActivationPayload(payload);
  const validationError = validateFirstUserPayload(normalized, options);

  if (validationError) return normalizeFirstUserActivationResponse({ ok: false, status: 400, message: validationError });

  const endpoints = endpointCandidatesFor("first-user");
  const body = buildActivateFirstUserBody(normalized);

  runtime.firstUserCount += 1;
  runtime.lastFirstUserAt = nowMs();

  safeEmit("auth:activation:first-user:start", { endpoints, identifierType: normalized.email ? "email" : normalized.phone ? "phone" : normalized.username ? "username" : "identifier", hasCompanyName: Boolean(normalized.companyName) }, options);

  runtime.firstUserInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const normalizedResponse = normalizeFirstUserActivationResponse(raw);
      const sessionSnapshot = maybeApplyReturnedSession(normalizedResponse, "activation:first-user");
      const finalResponse = { ...normalizedResponse, sessionApplied: Boolean(sessionSnapshot) };

      rememberResult("first-user", finalResponse);
      safeEmit("auth:activation:first-user:complete", { ok: finalResponse.ok, authenticated: finalResponse.authenticated, sessionApplied: finalResponse.sessionApplied, status: finalResponse.status, statusText: finalResponse.statusText, redirectTo: finalResponse.redirectTo }, options);

      return finalResponse;
    } catch (error) {
      rememberError("first-user", error);

      const normalizedError = normalizeTransportError(error, "No se pudo activar el primer usuario.");
      const normalizedResponse = normalizeFirstUserActivationResponse(normalizedError);

      rememberResult("first-user:error", normalizedResponse);
      safeEmit("auth:activation:first-user:error", { status: normalizedResponse.status, statusText: normalizedResponse.statusText, code: normalizedResponse.code, message: normalizedResponse.message }, options);

      return normalizedResponse;
    } finally {
      runtime.firstUserInFlight = null;
    }
  })();

  return runtime.firstUserInFlight;
}

export async function validateActivationToken(payload = {}, options = {}) {
  if (runtime.validateInFlight) return runtime.validateInFlight;

  const normalized = normalizeValidateActivationTokenPayload(payload);
  const validationError = validateTokenPayload(normalized);

  if (validationError) return normalizeValidateActivationTokenResponse({ ok: false, status: 400, message: validationError });

  const endpoints = endpointCandidatesFor("validate");
  const body = buildValidateActivationTokenBody(normalized);

  runtime.validateCount += 1;
  runtime.lastValidateAt = nowMs();

  safeEmit("auth:activation:validate:start", { endpoints }, options);

  runtime.validateInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const normalizedResponse = normalizeValidateActivationTokenResponse(raw);

      rememberResult("validate", normalizedResponse);
      safeEmit("auth:activation:validate:complete", { ok: normalizedResponse.ok, status: normalizedResponse.status, statusText: normalizedResponse.statusText }, options);

      return normalizedResponse;
    } catch (error) {
      rememberError("validate", error);

      const normalizedError = normalizeTransportError(error, "El token de activación no es válido.");
      const normalizedResponse = normalizeValidateActivationTokenResponse(normalizedError);

      rememberResult("validate:error", normalizedResponse);
      safeEmit("auth:activation:validate:error", { status: normalizedResponse.status, statusText: normalizedResponse.statusText, code: normalizedResponse.code, message: normalizedResponse.message }, options);

      return normalizedResponse;
    } finally {
      runtime.validateInFlight = null;
    }
  })();

  return runtime.validateInFlight;
}

/* =========================================================
   ALIASES
========================================================= */

export const activate = activateAccount;
export const activation = activateAccount;
export const confirmActivation = activateAccount;
export const accountActivation = activateAccount;
export const createUserActivation = activateAccount;
export const firstUserActivation = activateFirstUser;
export const activateInitialUser = activateFirstUser;
export const validateActivateAccountToken = validateActivationToken;
export const validateActivateToken = validateActivationToken;
export const validateAccountActivationToken = validateActivationToken;
export const activationValidate = validateActivationToken;

/* =========================================================
   DEBUG
========================================================= */

function sanitizeBodyForSnapshot(body = {}) {
  const output = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (TOKEN_FIELD_NAMES.has(key) || PASSWORD_FIELD_NAMES.has(key)) {
      output[key] = value ? "***" : value;
      continue;
    }

    output[key] = typeof value === "string" ? redactSafe(value) : value;
  }

  return output;
}

export function getActivationSnapshot() {
  return {
    version: ACTIVATION_MODULE_VERSION,
    activateEndpoint: getActivateAccountEndpoint(),
    activateEndpointCandidates: endpointCandidatesFor("activate"),
    activateFirstUserEndpoint: getActivateFirstUserEndpoint(),
    activateFirstUserEndpointCandidates: endpointCandidatesFor("first-user"),
    validateEndpoint: getValidateActivationTokenEndpoint(),
    validateEndpointCandidates: endpointCandidatesFor("validate"),
    currentPath: redactSafe(getCurrentPath()),
    hasTokenInCurrentUrl: Boolean(extractActivationTokenFromUrl()),
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
      identifierMaxLength: getIdentifierMaxLength(),
      tokenMinLength: getTokenMinLength(),
      tokenMaxLength: getTokenMaxLength(),
      passwordMinLength: getPasswordMinLength(),
      passwordMaxLength: getPasswordMaxLength(),
      timeout: getRequestTimeout(),
    },
    runtime: {
      activateInFlight: Boolean(runtime.activateInFlight),
      firstUserInFlight: Boolean(runtime.firstUserInFlight),
      validateInFlight: Boolean(runtime.validateInFlight),
      lastActivateAt: runtime.lastActivateAt,
      lastFirstUserAt: runtime.lastFirstUserAt,
      lastValidateAt: runtime.lastValidateAt,
      activateCount: runtime.activateCount,
      firstUserCount: runtime.firstUserCount,
      validateCount: runtime.validateCount,
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

export function getActivationDebugPayload(payload = {}) {
  return {
    activate: sanitizeBodyForSnapshot(buildActivateAccountBody(payload)),
    firstUser: sanitizeBodyForSnapshot(buildActivateFirstUserBody(payload)),
    validate: sanitizeBodyForSnapshot(buildValidateActivationTokenBody(payload)),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const Activation = Object.assign(activateAccount, {
  version: ACTIVATION_MODULE_VERSION,

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
});

export default Activation;

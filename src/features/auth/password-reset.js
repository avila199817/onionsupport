/* =========================================================
   Onion SPA - Password Reset
   Archivo: src/features/auth/password-reset.js

   AUTH PASSWORD RESET · FINAL SIMPLE
   - Flujo público request / validate / confirm
   - Transporte único vía CoreHttp
   - Sin fetch propio, apiClient propio, Router, Toast ni storage paralelo
   - No toca sesión salvo token + user explícitos del backend
   - Preserva rutas técnicas: la vista decide navegación/scrub
========================================================= */

import { AppCore } from "../../core/index.js";
import CoreHttp from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  AUTH_ENDPOINT_CANDIDATES,
  AUTH_CONSTANTS,
  AUTH_TOKEN_PARAM_NAMES,
  getPublicAuthRequestOptions,
  getAuthPublicTimeoutMs,
  getRequestPasswordResetEndpoint as getRequestPasswordResetEndpointFromConstants,
  getConfirmPasswordResetEndpoint as getConfirmPasswordResetEndpointFromConstants,
  getValidateResetTokenEndpoint as getValidateResetTokenEndpointFromConstants,
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
  persistLastResetIdentifier,
} from "./storage.js";

import {
  applySession,
} from "./session.js";

/* =========================================================
   META
========================================================= */

export const PASSWORD_RESET_MODULE_VERSION = "20.0.0-final";

const SOURCE = "auth.password-reset";

const DEFAULT_REQUEST_ENDPOINT = "/auth/reset-password-request";
const DEFAULT_CONFIRM_ENDPOINT = "/auth/reset-password-confirm";
const DEFAULT_VALIDATE_ENDPOINT = "/auth/reset-password/validate";
const DEFAULT_LOGIN_REDIRECT = "/login";
const DEFAULT_TIMEOUT_MS = 30000;

const SUCCESS_STATUS_TEXTS = new Set([
  "ok",
  "success",
  "succeeded",
  "accepted",
  "valid",
  "sent",
  "email_sent",
  "reset_sent",
  "password_reset_sent",
  "password_updated",
  "password_changed",
  "completed",
  "done",
]);

const SUCCESS_CODES = new Set([
  "OK",
  "SUCCESS",
  "RESET_SENT",
  "PASSWORD_RESET_SENT",
  "EMAIL_SENT",
  "TOKEN_VALID",
  "RESET_TOKEN_VALID",
  "PASSWORD_UPDATED",
  "PASSWORD_CHANGED",
  "PASSWORD_RESET_COMPLETED",
]);

const FAILURE_STATUS_TEXTS = new Set([
  "error",
  "failed",
  "failure",
  "invalid",
  "unauthorized",
  "forbidden",
  "expired",
  "rate_limited",
  "too_many_requests",
]);

const FAILURE_CODES = new Set([
  "INVALID_TOKEN",
  "TOKEN_INVALID",
  "TOKEN_EXPIRED",
  "RESET_TOKEN_EXPIRED",
  "RESET_TOKEN_INVALID",
  "PASSWORD_RESET_TOKEN_INVALID",
  "PASSWORD_RESET_TOKEN_EXPIRED",
  "INVALID_IDENTIFIER",
  "MISSING_IDENTIFIER",
  "MISSING_TOKEN",
  "MISSING_PASSWORD",
  "PASSWORD_MISMATCH",
  "RATE_LIMITED",
  "TOO_MANY_REQUESTS",
  "UNAUTHORIZED",
  "FORBIDDEN",
]);

const NEXT_ENDPOINT_STATUSES = new Set([404, 405, 410, 501]);

const BAD_TEXT_VALUES = new Set([
  "",
  "undefined",
  "null",
  "false",
  "true",
  "nan",
  "[object object]",
  "{}",
  "[]",
  "\"undefined\"",
  "\"null\"",
  "\"false\"",
  "\"true\"",
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

const TOKEN_FIELD_NAMES = new Set([
  "token",
  "code",
  "t",
  "resetToken",
  "reset_token",
  "reset_code",
  "passwordResetToken",
  "password_reset_token",
  "confirmToken",
  "confirm_token",
]);

const runtime = {
  requestInFlight: null,
  confirmInFlight: null,
  validateInFlight: null,
  lastRequestAt: 0,
  lastConfirmAt: 0,
  lastValidateAt: 0,
  requestCount: 0,
  confirmCount: 0,
  validateCount: 0,
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

function clampNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = safeNumber(value, min);
  return Math.min(Math.max(number, min), max);
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

function redact(value = "") {
  try {
    return redactTokenInText(value);
  } catch {
    return safeText(value, "")
      .replace(/([?&#](?:token|activationToken|activateToken|resetToken|passwordResetToken|confirmToken|code|t|access_token|refresh_token|id_token)=)([^&#\s]+)/gi, "$1***")
      .replace(/(\/reset-password\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(\/password-reset\/confirm\/)([^/?#\s]+)/gi, "$1***")
      .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
  }
}

function sanitizeEventPayload(value, depth = 0, keyHint = "") {
  const key = safeText(keyHint, "").toLowerCase();

  if (/token|password|authorization|secret|credential|cookie|jwt|bearer|refresh|access|code|otp|totp|csrf|xsrf/.test(key)) {
    return value ? "***" : value;
  }

  if (depth > 4) return "[depth-limit]";
  if (typeof value === "string") return redact(value);
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function") return "[function]";

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeEventPayload(item, depth + 1, keyHint));
  }

  if (isObject(value)) {
    const output = {};

    for (const [childKey, childValue] of Object.entries(value).slice(0, 80)) {
      output[childKey] = sanitizeEventPayload(childValue, depth + 1, childKey);
    }

    return output;
  }

  return redact(String(value));
}

function emit(eventName = "", payload = {}, options = {}) {
  const name = safeText(eventName, "");
  if (!name) return false;
  if (options.emit === false || options.emitEvents === false || options.silentEvents === true) return false;

  const detail = sanitizeEventPayload({
    source: SOURCE,
    version: PASSWORD_RESET_MODULE_VERSION,
    at: isoNow(),
    ...safeObject(payload),
  });

  try {
    AppCore?.events?.emit?.(name, detail);
    return true;
  } catch {}

  try {
    if (isBrowser() && typeof CustomEvent !== "undefined") {
      document.dispatchEvent(new CustomEvent(name, { detail }));
      return true;
    }
  } catch {}

  return false;
}

function warn(...args) {
  try {
    AppCore?.utils?.warn?.("[PasswordReset]", ...args.map((item) => sanitizeEventPayload(item)));
  } catch {}

  try {
    if (AppCore?.config?.debug) console.warn("[PasswordReset]", ...args.map((item) => sanitizeEventPayload(item)));
  } catch {}
}

/* =========================================================
   LIMITS / CONFIG
========================================================= */

function getIdentifierMaxLength() {
  return clampNumber(AUTH_CONSTANTS?.resetIdentifierMaxLength ?? AUTH_CONSTANTS?.identifierMaxLength ?? 160, 1, 512);
}

function getTokenMinLength() {
  return clampNumber(AUTH_CONSTANTS?.resetTokenMinLength ?? AUTH_CONSTANTS?.tokenMinLength ?? 8, 1, 4096);
}

function getTokenMaxLength() {
  return clampNumber(AUTH_CONSTANTS?.resetTokenMaxLength ?? AUTH_CONSTANTS?.tokenMaxLength ?? 8192, getTokenMinLength(), 32768);
}

function getPasswordMinLength() {
  return clampNumber(AUTH_CONSTANTS?.resetPasswordMinLength ?? AUTH_CONSTANTS?.passwordMinLength ?? 8, 1, 1024);
}

function getPasswordMaxLength() {
  return clampNumber(AUTH_CONSTANTS?.resetPasswordMaxLength ?? AUTH_CONSTANTS?.passwordMaxLength ?? 1024, getPasswordMinLength(), 8192);
}

function getTimeoutMs(options = {}) {
  const explicit = options.timeout ?? options.timeoutMs ?? options.passwordResetTimeoutMs;
  if (explicit !== undefined) return clampNumber(explicit, 1000, 120000);

  try {
    const fromConstants = getAuthPublicTimeoutMs?.();
    if (fromConstants) return clampNumber(fromConstants, 1000, 120000);
  } catch {}

  return clampNumber(AUTH_CONSTANTS?.authPublicTimeoutMs ?? AUTH_CONSTANTS?.requestTimeout ?? DEFAULT_TIMEOUT_MS, 1000, 120000);
}

function getDefaultCooldownSeconds() {
  return clampNumber(AUTH_CONSTANTS?.resetCooldownDefaultSeconds ?? 60, 0, 3600);
}

/* =========================================================
   MESSAGES
========================================================= */

const defaultRequestSuccessMessage = () => "Si el identificador existe, te enviaremos las instrucciones para restablecer la contraseña.";
const defaultRequestErrorMessage = () => "No se pudo iniciar la recuperación de acceso.";
const defaultConfirmSuccessMessage = () => "La contraseña se ha actualizado correctamente.";
const defaultConfirmErrorMessage = () => "No se pudo restablecer la contraseña.";
const defaultValidateSuccessMessage = () => "El token de recuperación es válido.";
const defaultValidateErrorMessage = () => "El token de recuperación no es válido.";
const rateLimitMessage = () => "Espera un momento antes de volver a intentarlo.";

/* =========================================================
   ENDPOINTS
========================================================= */

function normalizeAuthEndpoint(endpoint = "", fallback = DEFAULT_REQUEST_ENDPOINT) {
  const raw = safeText(endpoint, fallback);

  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/api/")) return raw;
  if (raw.startsWith("/auth/")) return raw;
  if (raw.startsWith("/")) return `/auth${raw}`;
  return `/auth/${raw}`;
}

function firstEndpoint(candidates = [], fallback = "") {
  return normalizeAuthEndpoint(candidates.find((item) => safeText(item, "")) || fallback, fallback);
}

function getConfiguredRequestEndpoint() {
  return firstEndpoint([
    isFunction(getRequestPasswordResetEndpointFromConstants) ? getRequestPasswordResetEndpointFromConstants() : "",
    AUTH_ENDPOINTS?.requestPasswordReset,
    AUTH_ENDPOINTS?.resetPasswordRequest,
    AUTH_ENDPOINTS?.forgotPassword,
    AUTH_ENDPOINTS?.recoverPassword,
    AUTH_ENDPOINTS?.passwordResetRequest,
    DEFAULT_REQUEST_ENDPOINT,
  ], DEFAULT_REQUEST_ENDPOINT);
}

function getConfiguredConfirmEndpoint() {
  return firstEndpoint([
    isFunction(getConfirmPasswordResetEndpointFromConstants) ? getConfirmPasswordResetEndpointFromConstants() : "",
    AUTH_ENDPOINTS?.confirmResetPassword,
    AUTH_ENDPOINTS?.confirmPasswordReset,
    AUTH_ENDPOINTS?.resetPasswordConfirm,
    AUTH_ENDPOINTS?.passwordResetConfirm,
    DEFAULT_CONFIRM_ENDPOINT,
  ], DEFAULT_CONFIRM_ENDPOINT);
}

function getConfiguredValidateEndpoint() {
  return firstEndpoint([
    isFunction(getValidateResetTokenEndpointFromConstants) ? getValidateResetTokenEndpointFromConstants() : "",
    AUTH_ENDPOINTS?.validateResetToken,
    AUTH_ENDPOINTS?.resetPasswordValidate,
    AUTH_ENDPOINTS?.validatePasswordReset,
    AUTH_ENDPOINTS?.passwordResetValidate,
    DEFAULT_VALIDATE_ENDPOINT,
  ], DEFAULT_VALIDATE_ENDPOINT);
}

function endpointCandidatesFor(type = "request") {
  if (type === "confirm") {
    return unique([
      getConfiguredConfirmEndpoint(),
      ...safeArray(AUTH_ENDPOINT_CANDIDATES?.confirmPasswordReset),
      DEFAULT_CONFIRM_ENDPOINT,
      "/auth/reset-password/confirm",
      "/auth/password-reset/confirm",
    ].map((item) => normalizeAuthEndpoint(item, DEFAULT_CONFIRM_ENDPOINT)));
  }

  if (type === "validate") {
    return unique([
      getConfiguredValidateEndpoint(),
      ...safeArray(AUTH_ENDPOINT_CANDIDATES?.validateResetToken),
      DEFAULT_VALIDATE_ENDPOINT,
      "/auth/reset-password-validate",
      "/auth/password-reset/validate",
    ].map((item) => normalizeAuthEndpoint(item, DEFAULT_VALIDATE_ENDPOINT)));
  }

  return unique([
    getConfiguredRequestEndpoint(),
    ...safeArray(AUTH_ENDPOINT_CANDIDATES?.requestPasswordReset),
    DEFAULT_REQUEST_ENDPOINT,
    "/auth/forgot-password",
    "/auth/password-reset/request",
    "/auth/reset-password/request",
  ].map((item) => normalizeAuthEndpoint(item, DEFAULT_REQUEST_ENDPOINT)));
}

export function getRequestPasswordResetEndpoint() {
  return getConfiguredRequestEndpoint();
}

export function getResetPasswordRequestEndpoint() {
  return getConfiguredRequestEndpoint();
}

export function getConfirmResetPasswordEndpoint() {
  return getConfiguredConfirmEndpoint();
}

export function getConfirmPasswordResetEndpoint() {
  return getConfiguredConfirmEndpoint();
}

export function getValidateResetPasswordTokenEndpoint() {
  return getConfiguredValidateEndpoint();
}

export function getValidateResetTokenEndpoint() {
  return getConfiguredValidateEndpoint();
}

/* =========================================================
   REDIRECT / TOKEN
========================================================= */

function sanitizeRedirect(value = "", fallback = "") {
  const raw = safeText(value, "");
  if (!raw) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;

  try {
    return sanitizeRedirectPath(raw, fallback || "") || fallback;
  } catch {
    let path = raw;
    if (!path.startsWith("/")) path = `/${path}`;
    path = path.replace(/\/{2,}/g, "/");
    return path || fallback;
  }
}

function isHashRouterPath(value = "") {
  const raw = safeText(value, "");
  return raw.startsWith("#/") || raw.startsWith("#!");
}

function normalizeHashRouterPath(value = "") {
  const raw = safeText(value, "/");
  if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || "/";
  return raw.replace(/^#\/?/, "/") || "/";
}

function normalizePathnameOnly(pathname = "/") {
  let value = safeText(pathname, "/").replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!value.startsWith("/")) value = `/${value}`;
  if (value.length > 1) value = value.replace(/\/+$/g, "") || "/";
  return value || "/";
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

function getTokenParamNames(type = "reset") {
  const names = AUTH_TOKEN_PARAM_NAMES?.[type];
  return Array.isArray(names) ? names : ["token", "resetToken", "passwordResetToken", "confirmToken", "code", "t"];
}

function normalizeResetToken(value = "") {
  let token = safeText(value, "");
  if (!token || isBadText(token)) return "";

  token = token.replace(/^bearer\s+/i, "").trim();
  if (/\s/.test(token)) return "";
  if (token.length > getTokenMaxLength()) return "";

  return token;
}

function extractTokenFromSearch(search = "", names = getTokenParamNames("reset")) {
  try {
    const params = new URLSearchParams(search || "");

    for (const name of names) {
      const token = normalizeResetToken(params.get(name));
      if (token) return token;
    }
  } catch {}

  return "";
}

function extractTokenFromPath(path = "") {
  let pathname = "";

  try {
    const parsed = new URL(path, "http://localhost");
    pathname = normalizePathnameOnly(parsed.pathname || "/");
  } catch {
    pathname = normalizePathnameOnly(safeText(path, "").split("?")[0].split("#")[0] || "/");
  }

  for (const marker of ["/reset-password/confirm/", "/password-reset/confirm/"]) {
    if (!pathname.startsWith(marker)) continue;

    const token = pathname.slice(marker.length).split("/")[0];

    try {
      return normalizeResetToken(decodeURIComponent(token || "")) || "";
    } catch {
      return normalizeResetToken(token) || "";
    }
  }

  return "";
}

function extractResetTokenFromUrl(pathOrUrl = getCurrentPath()) {
  const raw = safeText(pathOrUrl, "");
  if (!raw) return "";

  const value = isHashRouterPath(raw) ? normalizeHashRouterPath(raw) : raw;
  const pathToken = extractTokenFromPath(value);
  if (pathToken) return pathToken;

  try {
    const parsed = new URL(value, "http://localhost");
    const fromSearch = extractTokenFromSearch(parsed.search);
    if (fromSearch) return fromSearch;

    if (parsed.hash && isHashRouterPath(parsed.hash)) {
      const hashPath = normalizeHashRouterPath(parsed.hash);
      const fromHashPath = extractTokenFromPath(hashPath);
      if (fromHashPath) return fromHashPath;

      const hashQuery = hashPath.includes("?") ? hashPath.split("?").slice(1).join("?") : "";
      const fromHashQuery = extractTokenFromSearch(hashQuery ? `?${hashQuery}` : "");
      if (fromHashQuery) return fromHashQuery;
    }

    if (parsed.hash && parsed.hash.includes("?")) {
      const query = parsed.hash.split("?").slice(1).join("?");
      const fromHash = extractTokenFromSearch(query ? `?${query}` : "");
      if (fromHash) return fromHash;
    }
  } catch {
    if (value.includes("?")) {
      const query = value.split("?").slice(1).join("?").split("#")[0];
      const fromQuery = extractTokenFromSearch(query ? `?${query}` : "");
      if (fromQuery) return fromQuery;
    }
  }

  return "";
}

/* =========================================================
   PAYLOAD NORMALIZATION
========================================================= */

function looksLikeEmail(value = "") {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safeText(value, ""));
}

function looksLikePhone(value = "") {
  const clean = safeText(value, "").replace(/[^\d+]/g, "");
  return /^\+?\d{6,20}$/.test(clean);
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

function normalizeIdentifier(value = "") {
  const raw = safeText(value, "").normalize("NFKC").replace(/\s+/g, " ");
  if (isBadText(raw)) return "";
  return raw.slice(0, getIdentifierMaxLength() + 1);
}

function normalizePassword(value = "") {
  if (value === null || value === undefined) return "";
  return String(value);
}

export function resolveResetPasswordIdentifier(payload = {}) {
  return safeText(payload.identifier ?? payload.login ?? payload.email ?? payload.username ?? payload.user ?? payload.phone ?? payload.telefono ?? payload.mobile ?? "", "");
}

export function resolveResetPasswordToken(payload = {}) {
  return normalizeResetToken(payload.token ?? payload.code ?? payload.resetToken ?? payload.reset_token ?? payload.reset_code ?? payload.passwordResetToken ?? payload.password_reset_token ?? payload.confirmToken ?? payload.confirm_token ?? payload.t ?? extractResetTokenFromUrl());
}

export function normalizeResetPasswordPayload(payload = {}) {
  const identifier = normalizeIdentifier(resolveResetPasswordIdentifier(payload));
  const email = looksLikeEmail(identifier) ? normalizeEmail(identifier) : "";
  const phone = !email && looksLikePhone(identifier) ? normalizePhone(identifier) : "";
  const username = !email && !phone ? normalizeUsername(identifier) : "";
  const redirect = sanitizeRedirect(payload.redirect ?? payload.redirectTo ?? payload.returnTo ?? "", "");
  const lang = safeText(payload.lang ?? payload.language ?? AppCore?.state?.lang ?? AppCore?.config?.defaultLang ?? "es", "es").slice(0, 8);

  return { identifier, email, phone, username, redirect, lang };
}

export function normalizeConfirmResetPasswordPayload(payload = {}) {
  return {
    token: resolveResetPasswordToken(payload),
    password: normalizePassword(payload.password ?? payload.newPassword ?? payload.new_password ?? ""),
    confirmPassword: normalizePassword(payload.confirmPassword ?? payload.passwordConfirmation ?? payload.password_confirmation ?? payload.repeatPassword ?? payload.repeat_password ?? ""),
    redirect: sanitizeRedirect(payload.redirect ?? payload.redirectTo ?? payload.returnTo ?? DEFAULT_LOGIN_REDIRECT, DEFAULT_LOGIN_REDIRECT),
  };
}

export function normalizeValidateResetTokenPayload(payload = {}) {
  return { token: resolveResetPasswordToken(payload) };
}

export const normalizeValidateResetPasswordTokenPayload = normalizeValidateResetTokenPayload;

function stripEmpty(object = {}) {
  const output = {};

  for (const [key, value] of Object.entries(object)) {
    if (value !== null && value !== undefined && value !== "") output[key] = value;
  }

  return output;
}

export function buildResetPasswordRequestBody(payload = {}) {
  const normalized = normalizeResetPasswordPayload(payload);

  return stripEmpty({
    identifier: normalized.identifier,
    login: normalized.identifier,
    email: normalized.email,
    username: normalized.username,
    user: normalized.username,
    phone: normalized.phone,
    telefono: normalized.phone,
    redirect: normalized.redirect,
    redirectTo: normalized.redirect,
    returnTo: normalized.redirect,
    lang: normalized.lang,
    language: normalized.lang,
  });
}

export function buildConfirmResetPasswordBody(payload = {}) {
  const normalized = normalizeConfirmResetPasswordPayload(payload);

  return stripEmpty({
    token: normalized.token,
    code: normalized.token,
    t: normalized.token,
    resetToken: normalized.token,
    reset_token: normalized.token,
    reset_code: normalized.token,
    passwordResetToken: normalized.token,
    password_reset_token: normalized.token,
    confirmToken: normalized.token,
    confirm_token: normalized.token,
    password: normalized.password,
    newPassword: normalized.password,
    new_password: normalized.password,
    confirmPassword: normalized.confirmPassword,
    passwordConfirmation: normalized.confirmPassword,
    password_confirmation: normalized.confirmPassword,
    repeatPassword: normalized.confirmPassword,
    repeat_password: normalized.confirmPassword,
    redirect: normalized.redirect,
    redirectTo: normalized.redirect,
    returnTo: normalized.redirect,
  });
}

export function buildValidateResetTokenBody(payload = {}) {
  const normalized = normalizeValidateResetTokenPayload(payload);

  return stripEmpty({
    token: normalized.token,
    code: normalized.token,
    t: normalized.token,
    resetToken: normalized.token,
    reset_token: normalized.token,
    passwordResetToken: normalized.token,
    password_reset_token: normalized.token,
    confirmToken: normalized.token,
    confirm_token: normalized.token,
  });
}

export const buildValidateResetPasswordTokenBody = buildValidateResetTokenBody;

/* =========================================================
   RESPONSE NORMALIZATION
========================================================= */

function nodeList(input = {}) {
  const root = safeObject(input);
  const response = safeObject(root.response);

  return [root, safeObject(root.data), safeObject(root.payload), safeObject(root.result), safeObject(root.body), response, safeObject(response.data), safeObject(root.meta)].filter((node) => Object.keys(node).length > 0);
}

function pickPrimitive(nodes = [], keys = []) {
  for (const node of nodes) {
    for (const key of keys) {
      const value = node?.[key];
      if (["string", "number", "boolean"].includes(typeof value) && safeText(value, "")) return value;
    }
  }

  return "";
}

function resolveExplicitOk(input = {}) {
  for (const node of nodeList(input)) {
    for (const key of ["ok", "success", "valid", "accepted", "completed", "done", "sent", "emailSent", "email_sent", "resetSent", "reset_sent", "passwordResetSent", "password_reset_sent", "passwordUpdated", "password_updated", "passwordChanged", "password_changed"]) {
      if (typeof node[key] === "boolean") return node[key];
    }
  }

  return null;
}

function resolveStatus(input = {}) {
  return safeNumber(pickPrimitive(nodeList(input), ["status", "statusCode", "status_code"]), 0);
}

function resolveStatusText(input = {}) {
  const raw = pickPrimitive(nodeList(input), ["statusText", "status_text", "state", "status", "result", "type"]);
  const text = safeText(raw, "").toLowerCase();
  if (!text || Number.isFinite(Number(text))) return "";
  return text;
}

function resolveCode(input = {}) {
  return safeText(pickPrimitive(nodeList(input), ["code", "errorCode", "error_code", "error"]), "");
}

function resolveMessage(input = {}, fallback = "") {
  for (const node of nodeList(input)) {
    const error = safeObject(node.error);
    const message = pickText(node.message, node.mensaje, error.message, error.mensaje, error.detail, node.detail, node.description, typeof node.error === "string" ? node.error : "", node.title, node.reason, node.msg);
    if (message) return message;
  }

  return fallback;
}

function resolveRedirectTo(input = {}, fallback = "") {
  const raw = pickPrimitive(nodeList(input), ["redirectTo", "redirect_to", "redirect", "next", "nextPath", "next_path", "returnTo", "return_to"]);
  return sanitizeRedirect(raw, fallback);
}

function resolveEmailMasked(input = {}) {
  return safeText(pickPrimitive(nodeList(input), ["emailMasked", "maskedEmail", "masked_email"]), "");
}

function parseRetryAfterToSeconds(value = "") {
  const raw = safeText(value, "");
  if (!raw) return 0;

  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.max(0, Math.ceil(numeric));

  const dateMs = Date.parse(raw);
  if (Number.isFinite(dateMs)) return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));

  return 0;
}

function resolveRetryAfter(input = {}) {
  return Math.max(0, safeNumber(pickPrimitive(nodeList(input), ["retryAfter", "retry_after", "cooldownSeconds", "cooldown_seconds", "rateLimitSeconds", "rate_limit_seconds"]), 0));
}

function isCooldownResponse(input = {}) {
  const status = resolveStatus(input);
  const retryAfter = resolveRetryAfter(input);
  const code = resolveCode(input).toUpperCase();
  const statusText = resolveStatusText(input);

  return Boolean(status === 429 || retryAfter > 0 || code === "RATE_LIMITED" || code === "TOO_MANY_REQUESTS" || statusText === "rate_limited" || statusText === "too_many_requests" || nodeList(input).some((node) => node.cooldown === true || node.rateLimited === true || node.rate_limited === true));
}

function isExplicitFailure(input = {}) {
  const explicitOk = resolveExplicitOk(input);
  if (explicitOk === false) return true;

  const status = resolveStatus(input);
  if (Number.isFinite(status) && status >= 400) return true;

  const statusText = resolveStatusText(input);
  if (statusText && FAILURE_STATUS_TEXTS.has(statusText)) return true;

  const code = resolveCode(input).toUpperCase();
  if (code && FAILURE_CODES.has(code)) return true;

  return false;
}

function isDeclaredSuccess(input = {}) {
  const explicitOk = resolveExplicitOk(input);
  if (explicitOk === true) return true;
  if (explicitOk === false) return false;

  const code = resolveCode(input).toUpperCase();
  if (code && SUCCESS_CODES.has(code)) return true;

  const statusText = resolveStatusText(input);
  return Boolean(statusText && SUCCESS_STATUS_TEXTS.has(statusText));
}

function hasCompleteSession(input = {}) {
  const token = extractToken(input);
  const user = extractUser(input);
  return Boolean(token && user && user.active !== false && (user.id || user.userId || user.email || user.username));
}

function normalizeBaseResponse(input = {}, { successMessage = "", errorMessage = "", redirectFallback = "" } = {}) {
  const cooldown = isCooldownResponse(input);
  const retryAfter = resolveRetryAfter(input);
  const explicitFailure = isExplicitFailure(input);
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
    authenticated: Boolean(sessionComplete),
    status: resolveStatus(input),
    statusText: resolveStatusText(input) || null,
    code: resolveCode(input) || null,
    explicitFailure,
    cooldown,
    rateLimited: cooldown,
    retryAfter,
    cooldownSeconds: retryAfter,
    message: resolveMessage(input, ok ? successMessage : cooldown ? rateLimitMessage() : errorMessage),
    redirectTo: resolveRedirectTo(input, redirectFallback),
    emailMasked: resolveEmailMasked(input),
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

export function normalizeResetPasswordResponse(input = {}) {
  return normalizeBaseResponse(input, { successMessage: defaultRequestSuccessMessage(), errorMessage: defaultRequestErrorMessage(), redirectFallback: "" });
}

export function normalizeConfirmResetPasswordResponse(input = {}) {
  const normalized = normalizeBaseResponse(input, { successMessage: defaultConfirmSuccessMessage(), errorMessage: defaultConfirmErrorMessage(), redirectFallback: DEFAULT_LOGIN_REDIRECT });
  return { ...normalized, redirectTo: normalized.redirectTo || DEFAULT_LOGIN_REDIRECT };
}

export function normalizeValidateResetTokenResponse(input = {}) {
  return normalizeBaseResponse(input, { successMessage: defaultValidateSuccessMessage(), errorMessage: defaultValidateErrorMessage(), redirectFallback: "" });
}

export const normalizeValidateResetPasswordTokenResponse = normalizeValidateResetTokenResponse;

/* =========================================================
   TRANSPORT
========================================================= */

function buildRequestOptions(options = {}) {
  let publicOptions = {};

  try {
    publicOptions = getPublicAuthRequestOptions?.() || {};
  } catch {}

  const timeout = getTimeoutMs(options);

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
      "X-Onion-Auth-Flow": "password-reset",
      "X-Request-Source": SOURCE,
      ...safeObject(options.headers),
    },
  };
}

async function executeRequest(endpoint, body, options = {}) {
  if (!isFunction(CoreHttp?.post)) {
    const error = new Error("CoreHttp no disponible para password-reset.");
    error.status = 500;
    error.code = "CORE_HTTP_MISSING";
    throw error;
  }

  return CoreHttp.post(endpoint, body, buildRequestOptions(options));
}

function getErrorStatus(error = null) {
  return safeNumber(error?.status || error?.statusCode || error?.response?.status || error?.data?.status || error?.response?.data?.status || 0, 0);
}

function shouldTryNextEndpoint(error = null) {
  return NEXT_ENDPOINT_STATUSES.has(getErrorStatus(error));
}

async function executeWithCandidates(candidates = [], body = {}, options = {}) {
  let lastError = null;

  for (const endpoint of unique(candidates)) {
    try {
      return await executeRequest(endpoint, body, { ...safeObject(options), endpoint });
    } catch (error) {
      lastError = error;
      if (!shouldTryNextEndpoint(error)) throw error;
    }
  }

  throw lastError || new Error("No hay endpoint password-reset disponible.");
}

/* =========================================================
   ERRORS / COOLDOWN
========================================================= */

function normalizeTransportError(error = null, fallbackMessage = defaultRequestErrorMessage()) {
  const status = getErrorStatus(error);
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
    timeout: error?.timeout === true || String(error?.name || "").toLowerCase().includes("timeout") || String(error?.code || "").toLowerCase().includes("timeout"),
    aborted: error?.aborted === true || String(error?.name || "") === "AbortError",
    message: error?.data?.message || error?.data?.mensaje || error?.data?.error?.message || error?.data?.error || error?.response?.data?.message || error?.response?.data?.mensaje || error?.response?.data?.error?.message || error?.response?.data?.error || error?.message || (status === 429 || retryAfter > 0 ? rateLimitMessage() : fallbackMessage),
    data: error?.data || error?.response?.data || null,
    raw: error || null,
  };
}

function rememberError(type = "unknown", error = null) {
  runtime.lastError = {
    type,
    message: safeText(error?.message, ""),
    status: getErrorStatus(error),
    code: error?.code || null,
    timeout: error?.timeout === true,
    aborted: error?.aborted === true,
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

  if (result?.cooldown && result?.retryAfter) setCooldown(result.retryAfter);
  if (result?.ok) clearPasswordResetCooldown();
}

function getRemainingCooldownSeconds() {
  return Math.max(0, Math.ceil((runtime.cooldownUntil - nowMs()) / 1000));
}

function setCooldown(seconds = 0) {
  const value = clampNumber(seconds || getDefaultCooldownSeconds(), 0, 3600);
  runtime.cooldownUntil = value > 0 ? nowMs() + value * 1000 : 0;
  return value;
}

export function clearPasswordResetCooldown() {
  runtime.cooldownUntil = 0;
  return true;
}

function cooldownResponse() {
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
    message: rateLimitMessage(),
    raw: { ok: false, status: 429, retryAfter, message: rateLimitMessage() },
    at: isoNow(),
  };
}

/* =========================================================
   VALIDATION / SESSION
========================================================= */

function validateRequestPayload(normalized = {}) {
  if (!normalized.identifier) return "No se recibió identificador para recuperación de acceso.";
  if (normalized.identifier.length > getIdentifierMaxLength()) return "El identificador es demasiado largo.";
  return "";
}

function validateConfirmPayload(normalized = {}) {
  if (!normalized.token) return "No se recibió token de recuperación.";
  if (normalized.token.length < getTokenMinLength()) return "El token de recuperación no es válido.";
  if (!normalized.password) return "La nueva contraseña es obligatoria.";
  if (normalized.password.length < getPasswordMinLength()) return `La contraseña debe tener al menos ${getPasswordMinLength()} caracteres.`;
  if (normalized.password.length > getPasswordMaxLength()) return "La contraseña es demasiado larga.";
  if (!normalized.confirmPassword) return "La confirmación de contraseña es obligatoria.";
  if (normalized.confirmPassword.length > getPasswordMaxLength()) return "La confirmación de contraseña es demasiado larga.";
  if (normalized.password !== normalized.confirmPassword) return "Las contraseñas no coinciden.";
  return "";
}

function validateTokenPayload(normalized = {}) {
  if (!normalized.token) return "No se recibió token de recuperación.";
  if (normalized.token.length < getTokenMinLength()) return "El token de recuperación no es válido.";
  return "";
}

function maybePersistResetIdentifier(identifier = "") {
  const value = safeText(identifier, "");
  if (!value) return false;

  try {
    persistLastResetIdentifier(value);
    return true;
  } catch {
    return false;
  }
}

function maybeApplyReturnedSession(result = {}, source = "password-reset") {
  if (!result?.authenticated || !result?.token || !result?.user) return null;

  try {
    return applySession({
      token: result.token,
      accessToken: result.token,
      access_token: result.token,
      refreshToken: result.refreshToken || null,
      refresh_token: result.refreshToken || null,
      user: result.user,
      usuario: result.user,
      me: result.user,
      session: result.sessionData || result.session || null,
      sessionData: result.sessionData || result.session || null,
      authenticated: true,
      preserveExistingUser: false,
      source,
      eventMode: "login",
    }, {
      source,
      eventMode: "login",
      silent: true,
      emit: false,
    });
  } catch (error) {
    warn("No se pudo aplicar sesión devuelta por password-reset.", error);
    return null;
  }
}

/* =========================================================
   ACTIONS
========================================================= */

export async function requestPasswordReset(payload = {}, options = {}) {
  if (runtime.requestInFlight) return runtime.requestInFlight;
  if (getRemainingCooldownSeconds() > 0) return normalizeResetPasswordResponse(cooldownResponse());

  const normalized = normalizeResetPasswordPayload(payload);
  const validationError = validateRequestPayload(normalized);

  if (validationError) return normalizeResetPasswordResponse({ ok: false, status: 400, message: validationError });

  const body = buildResetPasswordRequestBody(normalized);
  const endpoints = endpointCandidatesFor("request");

  runtime.requestCount += 1;
  runtime.lastRequestAt = nowMs();
  maybePersistResetIdentifier(normalized.identifier);

  emit("auth:password-reset:request:start", {
    endpoints,
    identifierType: normalized.email ? "email" : normalized.phone ? "phone" : normalized.username ? "username" : "identifier",
  }, options);

  runtime.requestInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const result = normalizeResetPasswordResponse(raw);

      rememberResult("request", result);
      emit("auth:password-reset:request:complete", { ok: result.ok, status: result.status, statusText: result.statusText, cooldown: result.cooldown, retryAfter: result.retryAfter }, options);

      return result;
    } catch (error) {
      rememberError("request", error);

      const result = normalizeResetPasswordResponse(normalizeTransportError(error, defaultRequestErrorMessage()));
      rememberResult("request:error", result);

      emit("auth:password-reset:request:error", { status: result.status, statusText: result.statusText, code: result.code, cooldown: result.cooldown, retryAfter: result.retryAfter, message: result.message }, options);

      return result;
    } finally {
      runtime.requestInFlight = null;
    }
  })();

  return runtime.requestInFlight;
}

export async function confirmResetPassword(payload = {}, options = {}) {
  if (runtime.confirmInFlight) return runtime.confirmInFlight;

  const normalized = normalizeConfirmResetPasswordPayload(payload);
  const validationError = validateConfirmPayload(normalized);

  if (validationError) return normalizeConfirmResetPasswordResponse({ ok: false, status: 400, message: validationError });

  const body = buildConfirmResetPasswordBody(normalized);
  const endpoints = endpointCandidatesFor("confirm");

  runtime.confirmCount += 1;
  runtime.lastConfirmAt = nowMs();

  emit("auth:password-reset:confirm:start", { endpoints }, options);

  runtime.confirmInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const result = normalizeConfirmResetPasswordResponse(raw);
      const sessionSnapshot = maybeApplyReturnedSession(result, "password-reset:confirm");
      const finalResult = { ...result, sessionApplied: Boolean(sessionSnapshot) };

      rememberResult("confirm", finalResult);
      emit("auth:password-reset:confirm:complete", { ok: finalResult.ok, status: finalResult.status, statusText: finalResult.statusText, cooldown: finalResult.cooldown, retryAfter: finalResult.retryAfter, redirectTo: finalResult.redirectTo, sessionApplied: finalResult.sessionApplied }, options);

      return finalResult;
    } catch (error) {
      rememberError("confirm", error);

      const result = normalizeConfirmResetPasswordResponse(normalizeTransportError(error, defaultConfirmErrorMessage()));
      rememberResult("confirm:error", result);

      emit("auth:password-reset:confirm:error", { status: result.status, statusText: result.statusText, code: result.code, cooldown: result.cooldown, retryAfter: result.retryAfter, message: result.message }, options);

      return result;
    } finally {
      runtime.confirmInFlight = null;
    }
  })();

  return runtime.confirmInFlight;
}

export async function validateResetPasswordToken(payload = {}, options = {}) {
  if (runtime.validateInFlight) return runtime.validateInFlight;

  const normalized = normalizeValidateResetTokenPayload(payload);
  const validationError = validateTokenPayload(normalized);

  if (validationError) return normalizeValidateResetTokenResponse({ ok: false, status: 400, message: validationError });

  const body = buildValidateResetTokenBody(normalized);
  const endpoints = endpointCandidatesFor("validate");

  runtime.validateCount += 1;
  runtime.lastValidateAt = nowMs();

  emit("auth:password-reset:validate:start", { endpoints }, options);

  runtime.validateInFlight = (async () => {
    try {
      const raw = await executeWithCandidates(endpoints, body, options);
      const result = normalizeValidateResetTokenResponse(raw);

      rememberResult("validate", result);
      emit("auth:password-reset:validate:complete", { ok: result.ok, status: result.status, statusText: result.statusText }, options);

      return result;
    } catch (error) {
      rememberError("validate", error);

      const result = normalizeValidateResetTokenResponse(normalizeTransportError(error, defaultValidateErrorMessage()));
      rememberResult("validate:error", result);

      emit("auth:password-reset:validate:error", { status: result.status, statusText: result.statusText, code: result.code, message: result.message }, options);

      return result;
    } finally {
      runtime.validateInFlight = null;
    }
  })();

  return runtime.validateInFlight;
}

/* =========================================================
   ALIASES
========================================================= */

export const resetPasswordRequest = requestPasswordReset;
export const requestResetPassword = requestPasswordReset;
export const passwordResetRequest = requestPasswordReset;
export const forgotPassword = requestPasswordReset;
export const recoverPassword = requestPasswordReset;

export const resetPasswordConfirm = confirmResetPassword;
export const confirmPasswordReset = confirmResetPassword;
export const passwordResetConfirm = confirmResetPassword;

export const validateResetToken = validateResetPasswordToken;
export const resetPasswordValidate = validateResetPasswordToken;
export const validatePasswordReset = validateResetPasswordToken;
export const passwordResetValidate = validateResetPasswordToken;

/* =========================================================
   DEBUG
========================================================= */

function sanitizeBodyForSnapshot(body = {}) {
  const output = {};

  for (const [key, value] of Object.entries(body || {})) {
    if (PASSWORD_FIELD_NAMES.has(key) || TOKEN_FIELD_NAMES.has(key)) {
      output[key] = value ? "***" : value;
      continue;
    }

    output[key] = typeof value === "string" ? redact(value) : value;
  }

  return output;
}

export function getPasswordResetSnapshot() {
  return {
    version: PASSWORD_RESET_MODULE_VERSION,
    requestEndpoint: getRequestPasswordResetEndpoint(),
    requestEndpointCandidates: endpointCandidatesFor("request"),
    confirmEndpoint: getConfirmResetPasswordEndpoint(),
    confirmEndpointCandidates: endpointCandidatesFor("confirm"),
    validateEndpoint: getValidateResetPasswordTokenEndpoint(),
    validateEndpointCandidates: endpointCandidatesFor("validate"),
    currentPath: redact(getCurrentPath()),
    hasResetTokenInCurrentUrl: Boolean(extractResetTokenFromUrl()),
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
      timeout: getTimeoutMs(),
      defaultCooldownSeconds: getDefaultCooldownSeconds(),
    },
    runtime: {
      requestInFlight: Boolean(runtime.requestInFlight),
      confirmInFlight: Boolean(runtime.confirmInFlight),
      validateInFlight: Boolean(runtime.validateInFlight),
      lastRequestAt: runtime.lastRequestAt,
      lastConfirmAt: runtime.lastConfirmAt,
      lastValidateAt: runtime.lastValidateAt,
      requestCount: runtime.requestCount,
      confirmCount: runtime.confirmCount,
      validateCount: runtime.validateCount,
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

export function getPasswordResetDebugPayload(payload = {}) {
  return {
    request: sanitizeBodyForSnapshot(buildResetPasswordRequestBody(payload)),
    confirm: sanitizeBodyForSnapshot(buildConfirmResetPasswordBody(payload)),
    validate: sanitizeBodyForSnapshot(buildValidateResetTokenBody(payload)),
  };
}

/* =========================================================
   DEFAULT EXPORT
========================================================= */

const PasswordReset = Object.assign(requestPasswordReset, {
  version: PASSWORD_RESET_MODULE_VERSION,

  requestPasswordReset,
  resetPasswordRequest,
  requestResetPassword,
  passwordResetRequest,
  forgotPassword,
  recoverPassword,

  confirmResetPassword,
  resetPasswordConfirm,
  confirmPasswordReset,
  passwordResetConfirm,

  validateResetPasswordToken,
  validateResetToken,
  resetPasswordValidate,
  validatePasswordReset,
  passwordResetValidate,

  resolveResetPasswordIdentifier,
  resolveResetPasswordToken,

  normalizeResetPasswordPayload,
  normalizeConfirmResetPasswordPayload,
  normalizeValidateResetTokenPayload,
  normalizeValidateResetPasswordTokenPayload,

  buildResetPasswordRequestBody,
  buildConfirmResetPasswordBody,
  buildValidateResetTokenBody,
  buildValidateResetPasswordTokenBody,

  normalizeResetPasswordResponse,
  normalizeConfirmResetPasswordResponse,
  normalizeValidateResetTokenResponse,
  normalizeValidateResetPasswordTokenResponse,

  getRequestPasswordResetEndpoint,
  getResetPasswordRequestEndpoint,
  getConfirmResetPasswordEndpoint,
  getConfirmPasswordResetEndpoint,
  getValidateResetPasswordTokenEndpoint,
  getValidateResetTokenEndpoint,

  clearPasswordResetCooldown,

  getPasswordResetSnapshot,
  getPasswordResetDebugPayload,
});

export default PasswordReset;

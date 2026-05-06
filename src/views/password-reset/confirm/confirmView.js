/* =========================================================
   Onion SPA - Reset Password Confirm View
   Archivo: src/views/password-reset/confirm/confirmView.js

   FINAL PRO SYSTEM · RESET PASSWORD CONFIRM · HARDENED · 10/10

   RESPONSABILIDADES:
   - montar la vista pública de confirmación de reset password
   - leer token desde query, path-token, hash-router, history.state o contexto router
   - capturar token antes de limpiar la URL
   - limpiar token visible de la barra del navegador
   - no exponer token real en DOM
   - no exponer token real en logs/getState/contexto público
   - pedir contraseña nueva y confirmación antes de actualizar
   - renderizar template premium alineado con login/reset-password
   - ejecutar confirmación contra backend público
   - usar fetch directo contra API real, sin AppCore.http
   - manejar estados de carga, error y éxito
   - soportar navegación SPA de vuelta a login
   - limpiar listeners al destruir la vista
   - evitar doble submit y doble bind

   HARDENING EXTREMO:
   - endpoint alineado con AUTH_ENDPOINTS.confirmPasswordReset
   - fallback API base a https://api.onionit.net
   - soporte /reset-password/confirm/<token>
   - soporte hash router #/reset-password/confirm/<token>
   - soporte tokens en router context/history.state
   - password manual obligatorio
   - sin autosubmit
   - sin token real en inputs hidden
   - navegación login robusta
   - cleanup local + cleanup AppCore
========================================================= */

import { AppCore } from "../../../core/index.js";
import { Router } from "../../../router/index.js";

import { getConfirmTemplate } from "./confirm.template.js";

import {
  createConfirmPayload,
  validateConfirmPayload,
  getFirstConfirmError,
  normalizeConfirmResult,
  resolveConfirmErrorMessage,
  resolveConfirmRedirect,
  DEFAULT_SUCCESS_MESSAGE,
  safeText,
} from "./confirm.helpers.js";

import {
  getConfirmRefs,
  clearConfirmErrors,
  applyConfirmErrors,
  setGlobalConfirmError,
  setConfirmLoading,
  setConfirmSuccessState,
  focusConfirmPrimaryField,
  readConfirmFormState,
  bindConfirmSubmit,
  bindConfirmInputClearers,
  bindConfirmBack,
} from "./confirm.dom.js";

import createResetPasswordToastBridge from "../toast.bridge.js";

import {
  AUTH_ENDPOINTS,
  getConfirmPasswordResetEndpoint,
} from "../../../features/auth/constants.js";

/* =========================================================
   VIEW
========================================================= */

export const ConfirmResetPasswordView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:reset-password-confirm";

  const CONFIRM_ROUTE_PREFIX = "/reset-password/confirm";
  const DEFAULT_APP_NAME = "Onion Support";
  const DEFAULT_LOGIN_PATH = "/login";
  const DEFAULT_API_BASE_URL = "https://api.onionit.net";
  const FALLBACK_CONFIRM_ENDPOINT = "/api/auth/reset-password-confirm";

  const SUCCESS_REDIRECT_DELAY = 1800;
  const SCRUB_TOKEN_FROM_URL_AFTER_CAPTURE = true;

  const TEMPLATE_TOKEN_SENTINEL = "__captured_reset_password_token__";

  const TOKEN_PARAM_NAMES = Object.freeze([
    "token",
    "resetToken",
    "passwordResetToken",
    "reset_password_token",
    "code",
    "t",
  ]);

  const TOKEN_SENTINELS = new Set([
    TEMPLATE_TOKEN_SENTINEL,
    "__captured_token__",
    "__token_captured__",
  ]);

  const URL_FIELD_NAMES = Object.freeze([
    "publicPath",
    "requestedPath",
    "path",
    "href",
    "url",
    "redirectedFrom",
    "redirectFrom",
    "canonicalPath",
    "fullPath",
    "asPath",
    "pathname",
    "route",
  ]);

  const NESTED_CONTEXT_KEYS = Object.freeze([
    "params",
    "query",
    "search",
    "searchParams",
    "route",
    "state",
    "location",
    "meta",
    "data",
    "payload",
  ]);

  /* =========================================================
     LOCAL STATE
  ========================================================= */

  let mounted = false;
  let redirectTimerId = null;
  let localBindingsCleanup = null;

  let isSubmitting = false;
  let isNavigatingAway = false;

  let stableToken = "";
  let lastContext = null;

  /* =========================================================
     BASICS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function stringValue(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    return String(value);
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function isPlainObject(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value)
    );
  }

  function isLikelyContainer(value) {
    return Boolean(
      value &&
        typeof value === "object" &&
        typeof value.querySelector === "function"
    );
  }

  function resolveDeps(arg1, arg2) {
    if (isLikelyContainer(arg1)) {
      return arg2 && typeof arg2 === "object" ? arg2 : {};
    }

    return arg1 && typeof arg1 === "object" ? arg1 : {};
  }

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(eventName, payload);
    } catch {}
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[ConfirmResetPasswordView]", ...args);
    } catch {}
  }

  function safeWarnLog(...args) {
    try {
      AppCore?.utils?.warn?.("[ConfirmResetPasswordView]", ...args);
    } catch {}

    try {
      console.warn("[ConfirmResetPasswordView]", ...args);
    } catch {}
  }

  function safeErrorLog(...args) {
    try {
      AppCore?.utils?.error?.("[ConfirmResetPasswordView]", ...args);
    } catch {}

    try {
      console.error("[ConfirmResetPasswordView]", ...args);
    } catch {}
  }

  function getBaseOrigin() {
    if (isBrowser() && window.location?.origin) {
      return window.location.origin;
    }

    return "http://localhost";
  }

  function clearRedirectTimer() {
    if (!redirectTimerId || !isBrowser()) {
      return;
    }

    window.clearTimeout(redirectTimerId);
    redirectTimerId = null;
  }

  function runLocalBindingsCleanup() {
    const cleanup = localBindingsCleanup;
    localBindingsCleanup = null;

    try {
      cleanup?.();
    } catch {}
  }

  function composeCleanup(cleanups = []) {
    let done = false;

    return () => {
      if (done) {
        return;
      }

      done = true;

      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =========================================================
     PATH / REDACTION
  ========================================================= */

  function normalizePathnameOnly(pathname = "/") {
    let value = String(pathname || "/")
      .trim()
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value) {
      value = "/";
    }

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    if (value.length > 1 && value.endsWith("/")) {
      value = value.replace(/\/+$/g, "") || "/";
    }

    return value;
  }

  function isResetConfirmPathname(pathname = "") {
    const normalized = normalizePathnameOnly(pathname);

    return (
      normalized === CONFIRM_ROUTE_PREFIX ||
      normalized.startsWith(`${CONFIRM_ROUTE_PREFIX}/`)
    );
  }

  function redactResetTokenInText(value = "") {
    const raw = safeText(value, "");

    if (!raw) {
      return "";
    }

    return raw
      .replace(
        /\/reset-password\/confirm\/([^/?#\s]+)/gi,
        "/reset-password/confirm/***"
      )
      .replace(
        /([?&](?:token|resetToken|passwordResetToken|reset_password_token|code|t)=)([^&#\s]+)/gi,
        "$1***"
      );
  }

  function sanitizeContextForState(context = null) {
    const ctx = safeObject(context);

    if (!Object.keys(ctx).length) {
      return null;
    }

    return {
      publicPath: redactResetTokenInText(ctx.publicPath),
      requestedPath: redactResetTokenInText(ctx.requestedPath),
      path: redactResetTokenInText(ctx.path),
      href: redactResetTokenInText(ctx.href),
      url: redactResetTokenInText(ctx.url),
      redirectedFrom: redactResetTokenInText(ctx.redirectedFrom),
      canonicalPath: redactResetTokenInText(ctx.canonicalPath),
      hasContext: true,
    };
  }

  /* =========================================================
     TOKEN EXTRACTION
  ========================================================= */

  function isValidTokenCandidate(value = "") {
    const token = safeText(value, "");

    return Boolean(token && !TOKEN_SENTINELS.has(token));
  }

  function readTokenFieldsFromObject(value = {}) {
    const obj = safeObject(value);

    for (const key of TOKEN_PARAM_NAMES) {
      if (isValidTokenCandidate(obj[key])) {
        return safeText(obj[key], "");
      }
    }

    return "";
  }

  function getTokenFromSearchParams(search = "") {
    try {
      const params = new URLSearchParams(search || "");

      for (const key of TOKEN_PARAM_NAMES) {
        const value = safeText(params.get(key), "");

        if (isValidTokenCandidate(value)) {
          return value;
        }
      }

      /*
        Fallback para enlaces envueltos por trackers/mail clients.
      */
      for (const [, rawValue] of params.entries()) {
        const value = safeText(rawValue, "");

        if (!value) {
          continue;
        }

        const lower = value.toLowerCase();

        if (
          !lower.includes("token") &&
          !lower.includes("reset-password") &&
          !lower.includes("reset_password")
        ) {
          continue;
        }

        const nestedToken = extractTokenFromUrlLike(value);

        if (nestedToken) {
          return nestedToken;
        }

        try {
          const decoded = decodeURIComponent(value);
          const decodedToken = extractTokenFromUrlLike(decoded);

          if (decodedToken) {
            return decodedToken;
          }
        } catch {}
      }
    } catch {}

    return "";
  }

  function extractTokenFromRoutePath(pathname = "") {
    try {
      const normalized = normalizePathnameOnly(pathname);
      const parts = normalized.split("/").filter(Boolean);

      const resetIndex = parts.findIndex((part, index) => {
        return (
          String(part || "").toLowerCase() === "reset-password" &&
          String(parts[index + 1] || "").toLowerCase() === "confirm"
        );
      });

      if (resetIndex >= 0 && parts[resetIndex + 2]) {
        const value = safeText(
          decodeURIComponent(parts[resetIndex + 2]),
          ""
        );

        return isValidTokenCandidate(value) ? value : "";
      }
    } catch {}

    return "";
  }

  function extractTokenFromHash(hash = "") {
    const rawHash = safeText(hash, "");

    if (!rawHash) {
      return "";
    }

    try {
      const cleanHash = rawHash.replace(/^#\/?/, "/");

      const query = cleanHash.includes("?")
        ? cleanHash.split("?").slice(1).join("?")
        : "";

      const fromQuery = getTokenFromSearchParams(
        query ? `?${query}` : ""
      );

      if (fromQuery) {
        return fromQuery;
      }

      const pathOnly = cleanHash.split("?")[0] || "";

      return extractTokenFromRoutePath(pathOnly);
    } catch {
      return "";
    }
  }

  function extractTokenFromUrlLike(value = "") {
    const raw = safeText(value, "");

    if (!raw) {
      return "";
    }

    try {
      const parsed = new URL(raw, getBaseOrigin());

      const fromSearch = getTokenFromSearchParams(parsed.search);

      if (fromSearch) {
        return fromSearch;
      }

      const fromHash = extractTokenFromHash(parsed.hash);

      if (fromHash) {
        return fromHash;
      }

      return extractTokenFromRoutePath(parsed.pathname);
    } catch {
      try {
        const query = raw.includes("?")
          ? raw.split("?").slice(1).join("?")
          : "";

        const fromQuery = getTokenFromSearchParams(
          query ? `?${query}` : ""
        );

        if (fromQuery) {
          return fromQuery;
        }

        const fromHash = raw.includes("#")
          ? extractTokenFromHash(`#${raw.split("#").slice(1).join("#")}`)
          : "";

        if (fromHash) {
          return fromHash;
        }

        const pathOnly = raw.split("?")[0]?.split("#")[0] || raw;

        return extractTokenFromRoutePath(pathOnly);
      } catch {
        return "";
      }
    }
  }

  function extractTokenFromStructuredObject(value = null, depth = 0, seen = null) {
    if (!value || depth > 4) {
      return "";
    }

    if (!seen) {
      seen = new WeakSet();
    }

    if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) {
      return getTokenFromSearchParams(`?${value.toString()}`);
    }

    if (typeof value === "string") {
      return extractTokenFromUrlLike(value);
    }

    if (!isPlainObject(value)) {
      return "";
    }

    if (seen.has(value)) {
      return "";
    }

    seen.add(value);

    const direct = readTokenFieldsFromObject(value);

    if (direct) {
      return direct;
    }

    for (const field of URL_FIELD_NAMES) {
      const candidate = safeText(value[field], "");

      if (!candidate) {
        continue;
      }

      const fromUrl = extractTokenFromUrlLike(candidate);

      if (fromUrl) {
        return fromUrl;
      }
    }

    for (const key of NESTED_CONTEXT_KEYS) {
      const nested = value[key];

      if (!nested) {
        continue;
      }

      const nestedToken = extractTokenFromStructuredObject(
        nested,
        depth + 1,
        seen
      );

      if (nestedToken) {
        return nestedToken;
      }
    }

    return "";
  }

  function getHistoryStateObject() {
    if (!isBrowser()) {
      return null;
    }

    try {
      return window.history?.state && typeof window.history.state === "object"
        ? window.history.state
        : null;
    } catch {
      return null;
    }
  }

  function getContextUrlCandidates(context = null) {
    const ctx = safeObject(context);

    return [
      ctx.publicPath,
      ctx.requestedPath,
      ctx.path,
      ctx.href,
      ctx.url,
      ctx.redirectedFrom,
      ctx.redirectFrom,
      ctx.canonicalPath,
      ctx.fullPath,
      ctx.asPath,
      ctx.route?.publicPath,
      ctx.route?.path,
      ctx.route?.fullPath,
      ctx.route?.asPath,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean);
  }

  function getHistoryUrlCandidates() {
    const state = getHistoryStateObject();

    if (!state) {
      return [];
    }

    return [
      state.publicPath,
      state.path,
      state.requestedPath,
      state.url,
      state.canonicalPath,
      state.fullPath,
      state.asPath,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean);
  }

  function getWindowUrlCandidates() {
    const urls = [];

    if (!isBrowser()) {
      return urls;
    }

    try {
      urls.push(window.location.href);
    } catch {}

    try {
      urls.push(window.__ONION_RESET_PASSWORD_INITIAL_URL__);
    } catch {}

    try {
      urls.push(window.__ONION_INITIAL_URL__);
    } catch {}

    try {
      urls.push(document.referrer);
    } catch {}

    return urls
      .map((url) => safeText(url, ""))
      .filter(Boolean);
  }

  function getInitialResetUrlCandidates(context = null) {
    return [
      ...getContextUrlCandidates(context),
      ...getHistoryUrlCandidates(),
      ...getWindowUrlCandidates(),
    ]
      .map((url) => safeText(url, ""))
      .filter(Boolean);
  }

  function extractTokenFromContext(context = null) {
    const directContextToken = extractTokenFromStructuredObject(context);

    if (directContextToken) {
      return directContextToken;
    }

    const historyToken = extractTokenFromStructuredObject(getHistoryStateObject());

    if (historyToken) {
      return historyToken;
    }

    const candidates = getInitialResetUrlCandidates(context);

    for (const candidate of candidates) {
      const token = extractTokenFromUrlLike(candidate);

      if (token) {
        return token;
      }
    }

    return "";
  }

  function captureStableToken(context = {}) {
    const fromContextToken = safeText(context?.token, "");

    if (isValidTokenCandidate(fromContextToken)) {
      stableToken = fromContextToken;
      return stableToken;
    }

    const extractedToken = extractTokenFromContext(context);

    if (isValidTokenCandidate(extractedToken)) {
      stableToken = extractedToken;
    }

    /*
      Si ya capturamos token y la URL ya fue limpiada,
      no lo perdemos en rerenders posteriores.
    */
    return stableToken;
  }

  function clearSensitiveInitialUrlCache() {
    if (!isBrowser()) {
      return false;
    }

    try {
      if (window.__ONION_RESET_PASSWORD_INITIAL_URL__) {
        window.__ONION_RESET_PASSWORD_INITIAL_URL__ = "";
      }

      if (window.__ONION_INITIAL_URL__) {
        const parsed = new URL(
          window.__ONION_INITIAL_URL__,
          getBaseOrigin()
        );

        if (isResetConfirmPathname(parsed.pathname)) {
          window.__ONION_INITIAL_URL__ =
            `${window.location.origin}${CONFIRM_ROUTE_PREFIX}`;
        }
      }

      return true;
    } catch {
      try {
        window.__ONION_RESET_PASSWORD_INITIAL_URL__ = "";
      } catch {}

      return false;
    }
  }

  function scrubResetTokenFromUrl() {
    if (!SCRUB_TOKEN_FROM_URL_AFTER_CAPTURE || !isBrowser()) {
      return false;
    }

    try {
      if (
        !window.history ||
        typeof window.history.replaceState !== "function"
      ) {
        return false;
      }

      const currentUrl = new URL(window.location.href);
      const hashPath = safeText(currentUrl.hash, "").replace(/^#\/?/, "/");

      const isResetUrl =
        isResetConfirmPathname(currentUrl.pathname) ||
        isResetConfirmPathname(hashPath);

      if (!isResetUrl) {
        return false;
      }

      const cleanPath = CONFIRM_ROUTE_PREFIX;

      const currentState =
        window.history.state && typeof window.history.state === "object"
          ? {
              ...window.history.state,
              path: cleanPath,
              publicPath: cleanPath,
              canonicalPath: cleanPath,
              requestedPath: cleanPath,
              searchAndHash: "",
              scrubbedResetPasswordToken: true,
              hasResetPasswordToken: Boolean(stableToken),
              token: undefined,
              resetToken: undefined,
              passwordResetToken: undefined,
              reset_password_token: undefined,
              code: undefined,
              t: undefined,
            }
          : {
              path: cleanPath,
              publicPath: cleanPath,
              canonicalPath: cleanPath,
              requestedPath: cleanPath,
              searchAndHash: "",
              scrubbedResetPasswordToken: true,
              hasResetPasswordToken: Boolean(stableToken),
            };

      window.history.replaceState(currentState, "", cleanPath);

      try {
        AppCore?.setRoute?.(cleanPath);
      } catch {}

      try {
        AppCore?.setPublicPath?.(cleanPath);
      } catch {}

      try {
        AppCore?.setState?.({
          route: cleanPath,
          publicPath: cleanPath,
        });
      } catch {
        try {
          if (AppCore?.state) {
            AppCore.state.route = cleanPath;
            AppCore.state.publicPath = cleanPath;
          }
        } catch {}
      }

      clearSensitiveInitialUrlCache();

      return true;
    } catch {
      return false;
    }
  }

  function resolveStableToken(formToken = "") {
    const candidate = safeText(formToken, "");

    if (isValidTokenCandidate(candidate)) {
      return candidate;
    }

    return stableToken;
  }

  function getTemplateToken() {
    return stableToken ? TEMPLATE_TOKEN_SENTINEL : "";
  }

  /* =========================================================
     DOM
  ========================================================= */

  function getContainer() {
    if (!isBrowser()) {
      return null;
    }

    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("#view-container")
    );
  }

  function getShellElements() {
    if (!isBrowser()) {
      return {
        sidebar: null,
        topbar: null,
        topbarViewContainer: null,
        tableheadContainer: null,
      };
    }

    return {
      sidebar:
        AppCore?.dom?.sidebar ||
        document.getElementById("sidebar"),

      topbar:
        AppCore?.dom?.topbar ||
        document.getElementById("topbar") ||
        document.querySelector(".topbar"),

      topbarViewContainer:
        AppCore?.dom?.topbarViewContainer ||
        document.getElementById("topbarview-container"),

      tableheadContainer:
        AppCore?.dom?.tableheadContainer ||
        document.getElementById("tablehead-container"),
    };
  }

  /* =========================================================
     AUTH SCREEN
  ========================================================= */

  function setAuthScreen(active) {
    if (!isBrowser() || !document?.body) {
      return;
    }

    const enabled = Boolean(active);

    const {
      sidebar,
      topbar,
      topbarViewContainer,
      tableheadContainer,
    } = getShellElements();

    document.body.classList.toggle("auth-screen", enabled);
    document.body.classList.toggle("route-auth", enabled);
    document.body.classList.toggle("route-shell-hidden", enabled);
    document.body.classList.toggle("login-no-scroll", enabled);

    if (enabled) {
      document.body.dataset.authView = "reset-password-confirm";
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      try {
        delete document.body.dataset.authView;
      } catch {
        document.body.dataset.authView = "";
      }

      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    if (sidebar) sidebar.hidden = enabled;
    if (topbar) topbar.hidden = enabled;
    if (topbarViewContainer) topbarViewContainer.hidden = enabled;
    if (tableheadContainer) tableheadContainer.hidden = enabled;

    try {
      AppCore?.setShellVisibility?.(!enabled);
    } catch {}

    try {
      AppCore?.ui?.setShellVisibility?.(!enabled);
    } catch {}
  }

  /* =========================================================
     LOADER
  ========================================================= */

  function forceHideGlobalLoader() {
    if (!isBrowser()) {
      return;
    }

    const loader =
      AppCore?.dom?.loader ||
      document.getElementById("app-loader");

    try {
      AppCore?.setLoading?.(false);
    } catch {}

    try {
      document.body?.classList.remove("loading");
    } catch {}

    if (!loader) {
      return;
    }

    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.style.display = "none";
    loader.style.opacity = "0";
    loader.style.visibility = "hidden";
    loader.style.pointerEvents = "none";
  }

  function restoreGlobalLoaderStyles() {
    if (!isBrowser()) {
      return;
    }

    const loader =
      AppCore?.dom?.loader ||
      document.getElementById("app-loader");

    if (!loader) {
      return;
    }

    loader.hidden = false;
    loader.setAttribute("aria-hidden", "true");
    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";
  }

  /* =========================================================
     API URL
  ========================================================= */

  function getDefaultConfirmEndpoint() {
    let dynamicEndpoint = "";

    try {
      if (typeof getConfirmPasswordResetEndpoint === "function") {
        dynamicEndpoint = getConfirmPasswordResetEndpoint();
      }
    } catch {}

    return safeText(
      AUTH_ENDPOINTS?.confirmPasswordReset ||
        AUTH_ENDPOINTS?.resetPasswordConfirm ||
        AUTH_ENDPOINTS?.passwordResetConfirm ||
        dynamicEndpoint ||
        FALLBACK_CONFIRM_ENDPOINT,
      FALLBACK_CONFIRM_ENDPOINT
    );
  }

  function getApiBase() {
    const globalBase = isBrowser()
      ? (
          window.ONION_API_BASE_URL ||
          window.ONION_API_BASE ||
          window.API_BASE_URL ||
          ""
        )
      : "";

    return safeText(
      AppCore?.config?.apiBase ||
        AppCore?.config?.apiBaseUrl ||
        AppCore?.config?.baseApiUrl ||
        AppCore?.state?.config?.apiBase ||
        globalBase ||
        DEFAULT_API_BASE_URL,
      DEFAULT_API_BASE_URL
    ).replace(/\/+$/g, "");
  }

  function getConfirmEndpoint() {
    const globalEndpoint = isBrowser()
      ? window.ONION_RESET_PASSWORD_CONFIRM_ENDPOINT
      : "";

    return safeText(
      AppCore?.config?.resetPasswordConfirmEndpoint ||
        AppCore?.config?.confirmPasswordResetEndpoint ||
        AppCore?.config?.authResetPasswordConfirmEndpoint ||
        globalEndpoint ||
        getDefaultConfirmEndpoint(),
      FALLBACK_CONFIRM_ENDPOINT
    );
  }

  function joinApiUrl(base = "", endpoint = "") {
    const cleanEndpoint = safeText(endpoint, getConfirmEndpoint());

    if (/^https?:\/\//i.test(cleanEndpoint)) {
      return cleanEndpoint;
    }

    const cleanBase = safeText(base, DEFAULT_API_BASE_URL).replace(/\/+$/g, "");

    let path = cleanEndpoint.startsWith("/")
      ? cleanEndpoint
      : `/${cleanEndpoint}`;

    /*
      Soporta apiBase:
      - https://api.onionit.net
      - https://api.onionit.net/api
      - /api
    */
    if (cleanBase.endsWith("/api") && path.startsWith("/api/")) {
      path = path.replace(/^\/api/i, "");
    }

    return `${cleanBase}${path}`;
  }

  function buildApiUrl(endpoint = "") {
    return joinApiUrl(
      getApiBase(),
      endpoint || getConfirmEndpoint()
    );
  }

  /* =========================================================
     API REQUEST
  ========================================================= */

  async function requestConfirmResetPassword(payload = {}) {
    const token = safeText(payload?.token, "");

    const password = stringValue(
      payload?.password ||
        payload?.newPassword ||
        "",
      ""
    );

    const confirmPassword = stringValue(
      payload?.confirmPassword ||
        payload?.passwordConfirm ||
        payload?.repeatPassword ||
        "",
      ""
    );

    if (!token) {
      const err = new Error("El enlace no es válido o falta el token.");
      err.code = "RESET_TOKEN_MISSING";
      throw err;
    }

    if (!password.trim()) {
      const err = new Error("Introduce una contraseña nueva.");
      err.code = "RESET_PASSWORD_MISSING";
      throw err;
    }

    if (password !== confirmPassword) {
      const err = new Error("Las contraseñas no coinciden.");
      err.code = "RESET_PASSWORD_MISMATCH";
      throw err;
    }

    const endpoint = getConfirmEndpoint();
    const url = buildApiUrl(endpoint);

    const body = {
      token,
      resetToken: token,
      passwordResetToken: token,
      code: token,
      t: token,

      password,
      newPassword: password,
      confirmPassword,
      passwordConfirm: confirmPassword,
      repeatPassword: confirmPassword,
      password2: confirmPassword,
    };

    safeLog("reset confirm request", {
      method: "POST",
      url,
      hasToken: Boolean(token),
      hasPassword: Boolean(password),
    });

    if (!isBrowser() || typeof fetch !== "function") {
      const err = new Error("Fetch no está disponible en este entorno.");
      err.code = "FETCH_UNAVAILABLE";
      throw err;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Onion-Public-Action": "reset-password-confirm",
      },
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      body: JSON.stringify(body),
    });

    let rawText = "";
    let data = null;

    try {
      rawText = await response.text();
    } catch {
      rawText = "";
    }

    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      data = null;
    }

    if (!response.ok || data?.ok === false || data?.success === false) {
      const code =
        data?.code ||
        data?.error ||
        `HTTP_${response.status}`;

      const err = new Error(
        safeText(
          data?.message ||
            data?.mensaje ||
            data?.error ||
            `HTTP_${response.status}`,
          "No se pudo actualizar la contraseña."
        )
      );

      err.status = response.status;
      err.statusText = response.statusText || "";
      err.code = code;
      err.data = data;
      err.endpoint = url;
      err.method = "POST";

      throw err;
    }

    return data || {
      ok: true,
      success: true,
      message: DEFAULT_SUCCESS_MESSAGE,
    };
  }

  function resolveExecutor(deps = {}) {
    /*
      Por defecto usamos fetch directo.
      Evita interceptores, Authorization headers, baseURL incorrecta
      o mutaciones de body en AppCore.http/Auth.
    */
    if (deps.useInjectedExecutor === true) {
      const candidates = [
        deps.onSubmit,
        deps.submitConfirmReset,
        deps.confirmResetPassword,
        deps.resetPasswordConfirm,
      ];

      for (const fn of candidates) {
        if (typeof fn === "function") {
          return fn;
        }
      }
    }

    return requestConfirmResetPassword;
  }

  /* =========================================================
     ROUTING
  ========================================================= */

  function normalizePath(path = DEFAULT_LOGIN_PATH) {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      try {
        return AppCore.utils.normalizePath(path);
      } catch {}
    }

    const value =
      String(path || DEFAULT_LOGIN_PATH).trim() ||
      DEFAULT_LOGIN_PATH;

    if (value === "/") {
      return "/";
    }

    return (
      value
        .replace(/\/{2,}/g, "/")
        .replace(/\/+$/g, "") || "/"
    );
  }

  function navigateTo(path = DEFAULT_LOGIN_PATH) {
    const target = normalizePath(path);

    setAuthScreen(false);
    forceHideGlobalLoader();

    if (typeof Router?.navigate === "function") {
      Router.navigate(target, {
        replaceState: true,
        force: true,
      });
      return;
    }

    if (typeof AppCore?.router?.navigate === "function") {
      AppCore.router.navigate(target, {
        replaceState: true,
        force: true,
      });
      return;
    }

    if (typeof AppCore?.navigate === "function") {
      AppCore.navigate(target);
      return;
    }

    try {
      window.history.replaceState(
        {
          path: target,
          publicPath: target,
          canonicalPath: target,
        },
        "",
        target
      );

      try {
        window.dispatchEvent(new PopStateEvent("popstate"));
      } catch {
        window.dispatchEvent(new Event("popstate"));
      }

      return;
    } catch {}

    window.location.assign(target);
  }

  function navigateSoon(path = DEFAULT_LOGIN_PATH, delay = 0) {
    if (!isBrowser()) {
      return;
    }

    clearRedirectTimer();

    const safeDelay = Math.max(0, Number(delay) || 0);

    if (safeDelay <= 0) {
      navigateTo(path);
      return;
    }

    redirectTimerId = window.setTimeout(() => {
      navigateTo(path);
    }, safeDelay);
  }

  function emitRouteRendered() {
    safeEmit("app:route:rendered", {
      route: CONFIRM_ROUTE_PREFIX,
      view: "reset-password-confirm",
    });

    safeEmit("router:rendered", {
      route: CONFIRM_ROUTE_PREFIX,
      view: "reset-password-confirm",
    });
  }

  /* =========================================================
     CLEANUP
  ========================================================= */

  function destroyViewState() {
    clearRedirectTimer();
    runLocalBindingsCleanup();

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function runRender(deps = {}) {
    const container = getContainer();

    if (!container) {
      safeWarnLog("No existe #view-container.");
      forceHideGlobalLoader();

      return {
        ok: false,
        missingContainer: true,
      };
    }

    mounted = true;
    isSubmitting = false;
    isNavigatingAway = false;

    destroyViewState();
    restoreGlobalLoaderStyles();
    setAuthScreen(true);

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    try {
      AppCore?.setDocumentTitle?.("Nueva contraseña");
    } catch {
      if (isBrowser()) {
        document.title = "Nueva contraseña · Onion Support";
      }
    }

    const appName =
      safeText(AppCore?.config?.appName, "") ||
      DEFAULT_APP_NAME;

    lastContext = sanitizeContextForState(deps);

    captureStableToken(deps);

    const urlScrubbed = stableToken
      ? scrubResetTokenFromUrl()
      : false;

    safeLog("init", {
      hasToken: Boolean(stableToken),
      urlScrubbed,
      context: lastContext,
      endpoint: buildApiUrl(getConfirmEndpoint()),
    });

    container.innerHTML = getConfirmTemplate({
      appName,

      /*
        No pasamos token real al DOM.
        El submit recupera stableToken desde memoria.
      */
      token: getTemplateToken(),

      hasToken: Boolean(stableToken),
      tokenCaptured: Boolean(stableToken),

      heroEyebrow: "ONION SUPPORT · NUEVA CONTRASEÑA",
      heroTitle: "Configura una contraseña nueva de forma segura",

      bullets: [
        "Enlace temporal validado para cambio de contraseña",
        "Actualización segura de credenciales de acceso",
        "Flujo protegido alineado al entorno corporativo",
      ],

      title: "Crear nueva contraseña",
      subtitle: `Define una contraseña nueva para tu cuenta de ${appName}`,
      submitLabel: "Actualizar contraseña",
      backLabel: "Volver al acceso",
      backHref: DEFAULT_LOGIN_PATH,

      ...deps,

      /*
        Blindaje final: aunque deps.token venga con valor real,
        nunca llega al template.
      */
      token: getTemplateToken(),
    });

    forceHideGlobalLoader();
    bind(deps);

    return {
      ok: true,
      view: "reset-password-confirm",
      hasToken: Boolean(stableToken),
    };
  }

  /* =========================================================
     BIND
  ========================================================= */

  function bind(deps = {}) {
    if (!isBrowser()) {
      return;
    }

    const scope =
      AppCore?.cleanup?.scope?.(SCOPE) ||
      SCOPE;

    const container = getContainer();
    const refs = getConfirmRefs(container);

    if (
      !refs?.form ||
      !refs?.passwordInput ||
      !refs?.confirmPasswordInput
    ) {
      safeWarnLog("Nodos críticos ausentes.");
      forceHideGlobalLoader();
      return;
    }

    const toast =
      deps.toast ||
      createResetPasswordToastBridge(refs);

    toast.init?.();

    const executeConfirm = resolveExecutor(deps);

    const submitLabel =
      safeText(deps.submitLabel, "") ||
      "Actualizar contraseña";

    const loadingLabel =
      safeText(deps.loadingLabel, "") ||
      "Procesando...";

    setConfirmLoading(refs, false, {
      submitLabel,
      loadingLabel,
    });

    focusConfirmPrimaryField(refs);
    forceHideGlobalLoader();

    if (!stableToken) {
      const message = "El enlace no es válido o falta el token.";

      setGlobalConfirmError(refs, message);
      toast.error?.(message);
    }

    const onSubmit = async (event) => {
      event.preventDefault();

      if (isSubmitting || isNavigatingAway) {
        return;
      }

      clearConfirmErrors(refs);
      toast.dismiss?.();

      const formState = readConfirmFormState(refs);

      const submitToken = resolveStableToken(formState.token);

      const password = stringValue(
        formState.newPassword ||
          formState.password ||
          "",
        ""
      );

      const confirmPassword = stringValue(
        formState.confirmPassword ||
          formState.passwordConfirm ||
          "",
        ""
      );

      const payload = createConfirmPayload({
        token: submitToken,
        password,
        newPassword: password,
        confirmPassword,
        passwordConfirm: confirmPassword,
      });

      const errors = validateConfirmPayload(payload);

      if (!submitToken) {
        errors.token = "El enlace no es válido o falta el token.";
      }

      if (Object.keys(errors).length > 0) {
        const firstError =
          getFirstConfirmError(errors) ||
          "Revisa la nueva contraseña.";

        applyConfirmErrors(refs, errors);
        setGlobalConfirmError(refs, firstError);
        toast.error?.(firstError);

        return;
      }

      isSubmitting = true;

      setConfirmLoading(refs, true, {
        submitLabel,
        loadingLabel,
      });

      let loadingId = null;

      try {
        loadingId = toast.loading?.(
          "Actualizando contraseña...",
          {
            persist: true,
          }
        );

        const rawResult = await executeConfirm(payload);
        const result = normalizeConfirmResult(rawResult);

        toast.dismiss?.(loadingId);

        if (!result.ok) {
          throw result;
        }

        const successMessage =
          safeText(result.message, "") ||
          DEFAULT_SUCCESS_MESSAGE;

        /*
          Token ya no es necesario tras éxito.
        */
        stableToken = "";
        clearSensitiveInitialUrlCache();

        setConfirmSuccessState(refs, successMessage);
        toast.success?.(successMessage);

        safeEmit("auth:reset-password-confirm:success", {
          redirectTo: resolveConfirmRedirect(result, deps),
          hasToken: false,
        });

        if (deps.redirectAfterSuccess !== false) {
          isNavigatingAway = true;

          navigateSoon(
            resolveConfirmRedirect(result, deps),
            Number(deps.redirectDelay) ||
              SUCCESS_REDIRECT_DELAY
          );
        }
      } catch (error) {
        const message = resolveConfirmErrorMessage(error);

        toast.dismiss?.(loadingId);

        setGlobalConfirmError(refs, message);
        toast.error?.(message);

        safeEmit("auth:reset-password-confirm:error", {
          code: error?.code || error?.error || "",
          status: error?.status || "",
          message,
        });

        safeErrorLog("Reset confirm failed:", {
          method: error?.method || "POST",
          endpoint:
            error?.endpoint ||
            buildApiUrl(getConfirmEndpoint()),
          code:
            error?.code ||
            error?.error ||
            "",
          status: error?.status || "",
          statusText: error?.statusText || "",
          message: error?.message || "",
        });

        setConfirmLoading(refs, false, {
          submitLabel,
          loadingLabel,
        });
      } finally {
        if (!isNavigatingAway) {
          isSubmitting = false;

          if (refs?.form?.getAttribute("data-success") !== "true") {
            setConfirmLoading(refs, false, {
              submitLabel,
              loadingLabel,
            });
          }
        }
      }
    };

    const onClearErrors = () => {
      clearConfirmErrors(refs);
    };

    const onBack = (event) => {
      event.preventDefault();

      if (isSubmitting || isNavigatingAway) {
        return;
      }

      navigateTo(
        safeText(deps.backHref, "") ||
          DEFAULT_LOGIN_PATH
      );
    };

    const offInputs = bindConfirmInputClearers(
      refs,
      onClearErrors
    );

    const offSubmit = bindConfirmSubmit(
      refs,
      onSubmit
    );

    const offBack = bindConfirmBack(
      refs,
      onBack
    );

    const cleanup = composeCleanup([
      offInputs,
      offSubmit,
      offBack,
      () => clearRedirectTimer(),
      () => {
        if (!isNavigatingAway) {
          toast.dismiss?.();
          setAuthScreen(false);
          restoreGlobalLoaderStyles();
        }
      },
    ]);

    localBindingsCleanup = cleanup;

    try {
      AppCore?.cleanup?.add?.(scope, cleanup);
    } catch {}

    try {
      AppCore?.cleanup?.event?.(
        scope,
        "router:before-render",
        ({ detail } = {}) => {
          const nextPath =
            detail?.path ||
            detail?.canonicalPath ||
            detail?.publicPath ||
            "";

          if (
            nextPath &&
            !String(nextPath).startsWith(CONFIRM_ROUTE_PREFIX)
          ) {
            setAuthScreen(false);
          }
        }
      );
    } catch {}

    emitRouteRendered();
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  function init(arg1 = {}, arg2 = {}) {
    return runRender(
      resolveDeps(arg1, arg2)
    );
  }

  function render(arg1 = {}, arg2 = {}) {
    return runRender(
      resolveDeps(arg1, arg2)
    );
  }

  function destroy() {
    mounted = false;
    isSubmitting = false;
    isNavigatingAway = false;

    stableToken = "";
    lastContext = null;

    destroyViewState();
    setAuthScreen(false);
    restoreGlobalLoaderStyles();

    safeLog("destroy");
  }

  function getState() {
    return {
      mounted,
      submitting: isSubmitting,
      navigatingAway: isNavigatingAway,
      hasToken: Boolean(stableToken),
      token: stableToken ? "***" : "",
      context: lastContext,
      route: CONFIRM_ROUTE_PREFIX,
      endpoint: buildApiUrl(getConfirmEndpoint()),
    };
  }

  return {
    init,
    render,
    destroy,
    unmount: destroy,
    getState,
  };
})();

export default ConfirmResetPasswordView;

/* =========================================================
   Onion SPA - Activate Account View
   Archivo: src/views/activate-account/index.js

   ACTIVATE ACCOUNT VIEW · FINAL PRO SYSTEM · CSP CLEAN · 10/10
   LOGIN/RESET PASSWORD VISUAL CONTRACT ALIGNED · NO CSS · NO STYLE INJECTION

   RESPONSABILIDADES:
   - montar la vista pública de activación de cuenta
   - leer token desde URL normal, path-token, hash-router, history.state o contexto router
   - capturar token antes de limpiar la URL
   - limpiar token visible de la barra del navegador
   - no exponer token real en DOM
   - no exponer token real en logs/getState/contexto público
   - pedir contraseña nueva y confirmación antes de activar
   - reutilizar bindings compartidos de password-field
   - renderizar template premium alineado con login/reset-password
   - ejecutar activación contra backend real
   - manejar estados idle/loading/success/error/expired/invalid
   - soportar navegación SPA de vuelta a login
   - limpiar listeners al destruir la vista
   - evitar doble submit y doble bind

   HARDENING EXTREMO:
   - endpoint alineado con AUTH_ENDPOINTS.activateAccount
   - token capturado desde contexto router aunque window.location ya esté limpio
   - soporte /activate-account/<token>
   - password manual obligatorio
   - sin autosubmit
   - sin recuperación manual de token en UI
   - sin token real en inputs hidden
   - navegación login robusta
   - activación pública con fetch directo, sin AppCore.http
   - API base preferente: AppCore.config.apiBase / window.ONION_API_BASE_URL
   - fallback producción: https://api.onionit.net
   - evita llamadas erróneas a onionsupport.com/api/...
   - sin CSS inline
   - sin <style>
   - sin JS visual
========================================================= */

import {
  getActivateAccountTemplate,
  ACTIVATE_ACCOUNT_STATUS,
} from "./activate-account.template.js";

import { AppCore } from "../../core/index.js";

import {
  bindPasswordFieldsInScope,
} from "../../shared/password-field/index.js";

import {
  AUTH_ENDPOINTS,
  getActivateAccountEndpoint,
  getActivationPasswordMinLength,
} from "../../features/auth/constants.js";

/* =========================================================
   VIEW
========================================================= */

export const ActivateAccountView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:activate-account";

  const DEFAULT_APP_NAME = "Onion Support";
  const DEFAULT_LOGIN_PATH = "/login";
  const DEFAULT_API_BASE_URL = "https://api.onionit.net";

  const CLEAN_ACTIVATION_PUBLIC_PATH = "/activate-account";
  const TEMPLATE_CAPTURED_TOKEN_SENTINEL = "__captured_activation_token__";

  const DEFAULT_ACTIVATION_ENDPOINT =
    AUTH_ENDPOINTS?.activateAccount ||
    getActivateAccountEndpoint?.() ||
    "/api/auth/activate-account";

  const PASSWORD_MIN_LENGTH =
    Number(getActivationPasswordMinLength?.()) ||
    8;

  const SCRUB_TOKEN_FROM_URL_AFTER_CAPTURE = true;

  const TOKEN_PARAM_NAMES = Object.freeze([
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ]);

  /* =========================================================
     LOCAL STATE
  ========================================================= */

  const state = {
    mounted: false,
    destroyed: false,
    bindingsAttached: false,
    submitting: false,

    status: ACTIVATE_ACCOUNT_STATUS.IDLE,
    token: "",
    message: "",
    error: "",
    response: null,

    lastContext: null,
  };

  let cleanupBinding = null;
  let cleanupPasswordFields = null;
  let activeRequestController = null;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
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

  function stripTrailingSlashes(value = "") {
    return safeText(value, "").replace(/\/+$/g, "");
  }

  function stripLeadingSlashes(value = "") {
    return safeText(value, "").replace(/^\/+/g, "");
  }

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

  function isActivationPathname(pathname = "") {
    const normalized = normalizePathnameOnly(pathname);

    return (
      normalized === CLEAN_ACTIVATION_PUBLIC_PATH ||
      normalized.startsWith(`${CLEAN_ACTIVATION_PUBLIC_PATH}/`)
    );
  }

  function getBaseOrigin() {
    if (isBrowser() && window.location?.origin) {
      return window.location.origin;
    }

    return "http://localhost";
  }

  function redactActivationTokenInText(value = "") {
    const raw = safeText(value, "");

    if (!raw) {
      return "";
    }

    return raw
      .replace(
        /\/activate-account\/([^/?#\s]+)/gi,
        "/activate-account/***"
      )
      .replace(
        /([?&](?:token|activationToken|activateToken|code|t)=)([^&#\s]+)/gi,
        "$1***"
      );
  }

  function sanitizeContextForState(context = null) {
    const ctx = safeObject(context);

    if (!Object.keys(ctx).length) {
      return null;
    }

    return {
      publicPath: redactActivationTokenInText(ctx.publicPath),
      requestedPath: redactActivationTokenInText(ctx.requestedPath),
      path: redactActivationTokenInText(ctx.path),
      href: redactActivationTokenInText(ctx.href),
      url: redactActivationTokenInText(ctx.url),
      redirectedFrom: redactActivationTokenInText(ctx.redirectedFrom),
      routePublicPath: redactActivationTokenInText(ctx.route?.publicPath),
      routePath: redactActivationTokenInText(ctx.route?.path),
      hasContext: true,
    };
  }

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[ActivateAccountView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[ActivateAccountView]", ...args);
    } catch {}

    try {
      console.warn("[ActivateAccountView]", ...args);
    } catch {}
  }

  function safeError(...args) {
    try {
      AppCore?.utils?.error?.("[ActivateAccountView]", ...args);
    } catch {}

    try {
      console.error("[ActivateAccountView]", ...args);
    } catch {}
  }

  /* =========================================================
     DOM / CONFIG
  ========================================================= */

  function getContainer(explicitContainer = null) {
    if (explicitContainer) {
      return explicitContainer;
    }

    if (!isBrowser()) {
      return null;
    }

    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function getWindowApiBase() {
    if (!isBrowser()) {
      return "";
    }

    return safeText(
      window.ONION_API_BASE_URL ||
        window.ONION_API_BASE ||
        window.API_BASE_URL ||
        window.API_BASE ||
        "",
      ""
    );
  }

  function getApiBase() {
    return stripTrailingSlashes(
      AppCore?.config?.apiBase ||
        AppCore?.config?.apiBaseUrl ||
        AppCore?.config?.baseApiUrl ||
        AppCore?.config?.backendUrl ||
        AppCore?.state?.config?.apiBase ||
        getWindowApiBase() ||
        DEFAULT_API_BASE_URL
    );
  }

  function getActivationEndpoint() {
    const globalEndpoint =
      isBrowser()
        ? window.ONION_ACTIVATE_ACCOUNT_ENDPOINT
        : "";

    return safeText(
      AppCore?.config?.activateAccountEndpoint ||
        AppCore?.config?.activationEndpoint ||
        AppCore?.config?.authActivateEndpoint ||
        globalEndpoint ||
        DEFAULT_ACTIVATION_ENDPOINT,
      DEFAULT_ACTIVATION_ENDPOINT
    );
  }

  function joinUrl(base = "", path = "") {
    const left = stripTrailingSlashes(base);
    const right = stripLeadingSlashes(path);

    if (!left) {
      return right ? `/${right}` : "/";
    }

    if (!right) {
      return left;
    }

    return `${left}/${right}`;
  }

  function buildApiUrl(endpoint = "") {
    const rawEndpoint = safeText(endpoint, DEFAULT_ACTIVATION_ENDPOINT);

    if (/^https?:\/\//i.test(rawEndpoint)) {
      return rawEndpoint;
    }

    const cleanBase = stripTrailingSlashes(getApiBase());
    const endpointWithSlash = rawEndpoint.startsWith("/")
      ? rawEndpoint
      : `/${rawEndpoint}`;

    if (cleanBase) {
      if (
        cleanBase.endsWith("/api") &&
        endpointWithSlash.startsWith("/api/")
      ) {
        return `${cleanBase}${endpointWithSlash.replace(/^\/api/i, "")}`;
      }

      return `${cleanBase}${endpointWithSlash}`;
    }

    return endpointWithSlash.startsWith("/api/")
      ? endpointWithSlash
      : joinUrl("/api", endpointWithSlash);
  }

  /* =========================================================
     TOKEN EXTRACTION
  ========================================================= */

  function getTokenFromSearchParams(search = "") {
    try {
      const params = new URLSearchParams(search || "");

      for (const key of TOKEN_PARAM_NAMES) {
        const value = safeText(params.get(key), "");

        if (value) {
          return value;
        }
      }

      for (const [, rawValue] of params.entries()) {
        const value = safeText(rawValue, "");

        if (!value) {
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

      const index = parts.findIndex((part) => {
        return String(part || "").toLowerCase() === "activate-account";
      });

      if (index >= 0 && parts[index + 1]) {
        return safeText(decodeURIComponent(parts[index + 1]), "");
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

        const hash = raw.includes("#")
          ? `#${raw.split("#").slice(1).join("#")}`
          : "";

        const fromHash = extractTokenFromHash(hash);

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

  function getContextUrlCandidates(context = null) {
    const ctx = safeObject(context);

    return [
      ctx.publicPath,
      ctx.requestedPath,
      ctx.path,
      ctx.href,
      ctx.url,
      ctx.redirectedFrom,
      ctx.route?.publicPath,
      ctx.route?.path,
    ]
      .map((value) => safeText(value, ""))
      .filter(Boolean);
  }

  function getHistoryUrlCandidates() {
    if (!isBrowser()) {
      return [];
    }

    try {
      const historyState =
        window.history?.state &&
        typeof window.history.state === "object"
          ? window.history.state
          : null;

      if (!historyState) {
        return [];
      }

      return [
        historyState.publicPath,
        historyState.path,
        historyState.requestedPath,
        historyState.url,
        historyState.href,
      ]
        .map((value) => safeText(value, ""))
        .filter(Boolean);
    } catch {
      return [];
    }
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
      urls.push(window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__);
    } catch {}

    try {
      urls.push(window.__ONION_INITIAL_URL__);
    } catch {}

    return urls
      .map((url) => safeText(url, ""))
      .filter(Boolean);
  }

  function getInitialActivationUrlCandidates(context = null) {
    return [
      ...getContextUrlCandidates(context),
      ...getHistoryUrlCandidates(),
      ...getWindowUrlCandidates(),
    ]
      .map((url) => safeText(url, ""))
      .filter(Boolean);
  }

  function extractTokenFromUrl(context = null) {
    const candidates = getInitialActivationUrlCandidates(context);

    for (const candidate of candidates) {
      const token = extractTokenFromUrlLike(candidate);

      if (token) {
        return token;
      }
    }

    return "";
  }

  function clearSensitiveInitialUrlCache() {
    if (!isBrowser()) {
      return false;
    }

    try {
      window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ = "";

      if (window.__ONION_INITIAL_URL__) {
        const initialUrl = new URL(
          window.__ONION_INITIAL_URL__,
          getBaseOrigin()
        );

        if (isActivationPathname(initialUrl.pathname)) {
          window.__ONION_INITIAL_URL__ =
            `${window.location.origin}${CLEAN_ACTIVATION_PUBLIC_PATH}`;
        }
      }

      return true;
    } catch {
      try {
        window.__ONION_ACTIVATE_ACCOUNT_INITIAL_URL__ = "";
      } catch {}

      return false;
    }
  }

  function scrubActivationTokenFromUrl() {
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

      const isActivateUrl =
        isActivationPathname(currentUrl.pathname) ||
        isActivationPathname(hashPath);

      if (!isActivateUrl) {
        clearSensitiveInitialUrlCache();
        return false;
      }

      const cleanPath = CLEAN_ACTIVATION_PUBLIC_PATH;

      const cleanState = {
        path: cleanPath,
        publicPath: cleanPath,
        canonicalPath: cleanPath,
        searchAndHash: "",
        scrubbedActivationToken: true,
      };

      window.history.replaceState(
        cleanState,
        "",
        cleanPath
      );

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
      } catch {}

      clearSensitiveInitialUrlCache();

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     DOCUMENT / LAYOUT
  ========================================================= */

  function setDocumentTitle(status = state.status) {
    try {
      const titles = {
        [ACTIVATE_ACCOUNT_STATUS.IDLE]: "Activar cuenta",
        [ACTIVATE_ACCOUNT_STATUS.LOADING]: "Activando cuenta...",
        [ACTIVATE_ACCOUNT_STATUS.SUCCESS]: "Cuenta activada",
        [ACTIVATE_ACCOUNT_STATUS.ERROR]: "No se pudo activar la cuenta",
        [ACTIVATE_ACCOUNT_STATUS.EXPIRED]: "Enlace caducado",
        [ACTIVATE_ACCOUNT_STATUS.INVALID]: "Enlace no válido",
      };

      const title = titles[status] || "Activar cuenta";

      if (typeof AppCore?.setDocumentTitle === "function") {
        AppCore.setDocumentTitle(title);
        return;
      }

      if (isBrowser()) {
        document.title = `${title} · ${DEFAULT_APP_NAME}`;
      }
    } catch {}
  }

  function applyAuthLayoutMode(enabled = true) {
    if (isBrowser()) {
      try {
        document.body.classList.toggle("auth-screen", enabled);
        document.body.classList.toggle("auth-view-active", enabled);
        document.body.classList.toggle("login-view-active", enabled);
        document.body.classList.toggle("login-no-scroll", enabled);

        if (enabled) {
          document.body.dataset.authView = "activate-account";
        } else if (document.body.dataset.authView === "activate-account") {
          delete document.body.dataset.authView;
        }
      } catch {}
    }

    try {
      if (typeof AppCore?.setShellVisibility === "function") {
        AppCore.setShellVisibility(!enabled);
      }
    } catch {}

    try {
      if (typeof AppCore?.ui?.setShellVisibility === "function") {
        AppCore.ui.setShellVisibility(!enabled);
      }
    } catch {}
  }

  function abortActiveRequest() {
    try {
      activeRequestController?.abort?.();
    } catch {}

    activeRequestController = null;
  }

  /* =========================================================
     DOM FORM HELPERS
  ========================================================= */

  function getErrorElement() {
    if (!isBrowser()) {
      return null;
    }

    return document.getElementById("activateAccountError");
  }

  function setInlineError(message = "") {
    const text = safeText(message, "");
    const el = getErrorElement();

    state.error = text;

    if (!el) {
      return false;
    }

    try {
      el.textContent = text;
      el.hidden = !text;
      el.dataset.visible = text ? "true" : "false";
      return true;
    } catch {
      return false;
    }
  }

  function clearInlineError() {
    setInlineError("");
  }

  function focusElementById(id = "") {
    if (!isBrowser() || !id) {
      return false;
    }

    try {
      const element = document.getElementById(id);

      if (!element) {
        return false;
      }

      element.focus?.({
        preventScroll: false,
      });

      return true;
    } catch {
      try {
        document.getElementById(id)?.focus?.();
        return true;
      } catch {
        return false;
      }
    }
  }

  function getPasswordInputValues() {
    if (!isBrowser()) {
      return {
        password: "",
        confirmPassword: "",
      };
    }

    const passwordEl =
      document.getElementById("activateAccountPassword");

    const confirmEl =
      document.getElementById("activateAccountPasswordConfirm");

    return {
      password: stringValue(passwordEl?.value, ""),
      confirmPassword: stringValue(confirmEl?.value, ""),
    };
  }

  function validatePasswordInput({
    password = "",
    confirmPassword = "",
  } = {}) {
    if (!String(password || "").trim()) {
      return {
        ok: false,
        fieldId: "activateAccountPassword",
        message: "Introduce una contraseña nueva.",
      };
    }

    if (String(password).length < PASSWORD_MIN_LENGTH) {
      return {
        ok: false,
        fieldId: "activateAccountPassword",
        message: `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
      };
    }

    if (!String(confirmPassword || "").trim()) {
      return {
        ok: false,
        fieldId: "activateAccountPasswordConfirm",
        message: "Repite la contraseña nueva.",
      };
    }

    if (password !== confirmPassword) {
      return {
        ok: false,
        fieldId: "activateAccountPasswordConfirm",
        message: "Las contraseñas no coinciden.",
      };
    }

    return {
      ok: true,
      fieldId: "",
      message: "",
    };
  }

  function getActivationCredentials() {
    const values = getPasswordInputValues();
    const validation = validatePasswordInput(values);

    return {
      ...values,
      validation,
    };
  }

  function bindSharedPasswordFields(container) {
    try {
      if (typeof cleanupPasswordFields === "function") {
        cleanupPasswordFields();
      }
    } catch {}

    cleanupPasswordFields = null;

    try {
      if (typeof bindPasswordFieldsInScope === "function") {
        const result = bindPasswordFieldsInScope(container);

        if (typeof result === "function") {
          cleanupPasswordFields = result;
        }

        return true;
      }
    } catch (error) {
      safeWarn("No se pudieron inicializar los password-fields.", error);
    }

    return false;
  }

  /* =========================================================
     RESPONSE HELPERS
  ========================================================= */

  function normalizeBackendErrorCode(error = null) {
    return safeText(
      error?.code ||
        error?.error ||
        error?.data?.code ||
        error?.data?.error ||
        error?.response?.code ||
        error?.response?.error ||
        "",
      ""
    ).toUpperCase();
  }

  function resolveErrorStatus(error = null) {
    const code = normalizeBackendErrorCode(error);

    const message = safeText(
      error?.message ||
        error?.data?.message,
      ""
    ).toLowerCase();

    if (
      code.includes("EXPIRED") ||
      code.includes("TOKEN_EXPIRED") ||
      message.includes("caduc")
    ) {
      return ACTIVATE_ACCOUNT_STATUS.EXPIRED;
    }

    if (
      code.includes("INVALID") ||
      code.includes("NOT_FOUND") ||
      code.includes("MISSING") ||
      code.includes("USED") ||
      message.includes("no válido") ||
      message.includes("inval") ||
      message.includes("missing")
    ) {
      return ACTIVATE_ACCOUNT_STATUS.INVALID;
    }

    return ACTIVATE_ACCOUNT_STATUS.ERROR;
  }

  function resolveErrorMessage(error = null) {
    const statusCode = Number(error?.status || 0);
    const code = normalizeBackendErrorCode(error);
    const endpoint = safeText(error?.endpoint, "");

    if (statusCode === 405 || code === "HTTP_405") {
      return endpoint
        ? `La API no acepta POST en ${endpoint}. Revisa el router auth desplegado.`
        : "La API no acepta POST en el endpoint de activación. Revisa el router auth desplegado.";
    }

    if (statusCode === 404 || code === "HTTP_404") {
      return endpoint
        ? `No existe el endpoint de activación en ${endpoint}. Revisa la ruta backend desplegada.`
        : "No existe el endpoint de activación. Revisa la ruta backend desplegada.";
    }

    return safeText(
      error?.message ||
        error?.data?.message ||
        error?.response?.data?.message ||
        error?.response?.message ||
        error?.error ||
        "",
      "No se pudo activar la cuenta. Revisa el enlace o solicita uno nuevo."
    );
  }

  function resolveSuccessMessage(response = {}) {
    return safeText(
      response?.message ||
        response?.data?.message ||
        response?.payload?.message ||
        "",
      "Cuenta activada correctamente. Ya puedes iniciar sesión."
    );
  }

  function shouldClearTokenForStatus(status = "") {
    return (
      status === ACTIVATE_ACCOUNT_STATUS.SUCCESS ||
      status === ACTIVATE_ACCOUNT_STATUS.INVALID ||
      status === ACTIVATE_ACCOUNT_STATUS.EXPIRED
    );
  }

  /* =========================================================
     TOAST
  ========================================================= */

  function normalizeToastType(type = "info") {
    const clean = safeText(type, "info").toLowerCase();

    if (["success", "error", "warning", "info"].includes(clean)) {
      return clean;
    }

    return "info";
  }

  function showToast(message = "", type = "info", title = "") {
    const text = safeText(message, "");

    if (!text) {
      return false;
    }

    const finalType = normalizeToastType(type);

    try {
      if (typeof AppCore?.toast?.[finalType] === "function") {
        AppCore.toast[finalType](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.toast?.show === "function") {
        AppCore.toast.show(text, finalType);
        return true;
      }
    } catch {}

    if (!isBrowser()) {
      return false;
    }

    const toast = document.getElementById("activateAccountToast");
    const toastTitle = document.getElementById("activateAccountToastTitle");
    const toastText = document.getElementById("activateAccountToastText");
    const toastClose = document.getElementById("activateAccountToastClose");

    if (!toast || !toastText) {
      return false;
    }

    try {
      toast.hidden = false;
      toast.classList.add("is-visible");
      toast.classList.remove("is-success", "is-error", "is-warning", "is-info");
      toast.classList.add(`is-${finalType}`);

      toast.setAttribute("aria-hidden", "false");
      toast.dataset.state = finalType;

      if (toastTitle) {
        toastTitle.textContent = safeText(
          title,
          finalType === "error"
            ? "Error"
            : finalType === "success"
              ? "Correcto"
              : finalType === "warning"
                ? "Aviso"
                : "Información"
        );
      }

      toastText.textContent = text;

      const close = () => {
        try {
          toast.classList.remove("is-visible");
          toast.hidden = true;
          toast.setAttribute("aria-hidden", "true");
        } catch {}
      };

      toastClose?.addEventListener?.("click", close, {
        once: true,
      });

      window.setTimeout(close, finalType === "error" ? 6500 : 4200);

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     API REQUEST
  ========================================================= */

  async function requestWithFetch(endpoint = "", payload = {}) {
    const url = buildApiUrl(endpoint);

    abortActiveRequest();

    activeRequestController = typeof AbortController !== "undefined"
      ? new AbortController()
      : null;

    safeLog("activation request", {
      method: "POST",
      url,
      hasToken: Boolean(payload?.token),
      hasPassword: Boolean(payload?.password),
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Onion-Public-Action": "activate-account",
      },
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      signal: activeRequestController?.signal,
      body: JSON.stringify(payload),
    });

    let data = null;
    let rawText = "";

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

    activeRequestController = null;

    if (!response.ok || data?.ok === false) {
      const code =
        data?.code ||
        data?.error ||
        `HTTP_${response.status}`;

      const err = new Error(
        safeText(
          data?.message ||
            data?.error ||
            `HTTP_${response.status}`,
          "No se pudo activar la cuenta."
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
    };
  }

  async function activateAccountRequest(
    token = "",
    {
      password = "",
      confirmPassword = "",
    } = {}
  ) {
    const cleanToken = safeText(token, "");
    const cleanPassword = stringValue(password, "");
    const cleanConfirmPassword = stringValue(confirmPassword, "");

    if (!cleanToken) {
      const err = new Error("Falta el token de activación.");
      err.code = "ACTIVATION_TOKEN_MISSING";
      throw err;
    }

    if (!cleanPassword.trim()) {
      const err = new Error("Falta la contraseña.");
      err.code = "ACTIVATION_PASSWORD_MISSING";
      throw err;
    }

    if (cleanPassword !== cleanConfirmPassword) {
      const err = new Error("Las contraseñas no coinciden.");
      err.code = "ACTIVATION_PASSWORD_MISMATCH";
      throw err;
    }

    const endpoint = getActivationEndpoint();

    const payload = {
      token: cleanToken,
      activationToken: cleanToken,
      activateToken: cleanToken,
      code: cleanToken,
      t: cleanToken,

      password: cleanPassword,
      newPassword: cleanPassword,
      confirmPassword: cleanConfirmPassword,
      passwordConfirm: cleanConfirmPassword,
    };

    return await requestWithFetch(endpoint, payload);
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function getTemplateToken() {
    return state.token
      ? TEMPLATE_CAPTURED_TOKEN_SENTINEL
      : "";
  }

  function getTemplateOptions() {
    return {
      appName: DEFAULT_APP_NAME,
      status: state.status,

      token: getTemplateToken(),
      hasToken: Boolean(state.token),
      tokenCaptured: Boolean(state.token),

      loginHref: DEFAULT_LOGIN_PATH,
      backHref: DEFAULT_LOGIN_PATH,

      autoSubmit: false,

      passwordHelp:
        `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,

      copy: state.message
        ? {
            body: state.message,
            footer: state.message,
          }
        : {},
    };
  }

  function render(explicitContainer = null) {
    const container = getContainer(explicitContainer);

    if (!container) {
      safeWarn("No existe #view-container para ActivateAccountView.");
      return null;
    }

    setDocumentTitle(state.status);
    applyAuthLayoutMode(true);

    container.innerHTML = getActivateAccountTemplate(getTemplateOptions());

    state.mounted = true;

    return container;
  }

  function rerender() {
    if (state.destroyed) {
      return null;
    }

    const container = render();

    bind();

    return container;
  }

  function setStatus(nextStatus = ACTIVATE_ACCOUNT_STATUS.IDLE, patch = {}) {
    state.status = nextStatus;
    state.message = safeText(patch.message, "");
    state.error = safeText(patch.error, "");
    state.response = patch.response || null;

    if (shouldClearTokenForStatus(nextStatus)) {
      state.token = "";
    }

    rerender();
  }

  /* =========================================================
     NAVIGATION
  ========================================================= */

  async function navigateToLogin() {
    const target = DEFAULT_LOGIN_PATH;

    try {
      if (typeof AppCore?.router?.navigate === "function") {
        await AppCore.router.navigate(target, {
          replaceState: true,
          force: true,
        });
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.Router?.navigate === "function") {
        await AppCore.Router.navigate(target, {
          replaceState: true,
          force: true,
        });
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.modules?.Router?.navigate === "function") {
        await AppCore.modules.Router.navigate(target, {
          replaceState: true,
          force: true,
        });
        return true;
      }
    } catch {}

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

      return true;
    } catch {}

    try {
      window.location.assign(target);
      return true;
    } catch {}

    try {
      window.location.href = target;
      return true;
    } catch {}

    return false;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  async function handleActivate({ silent = false } = {}) {
    if (state.submitting) {
      return null;
    }

    clearInlineError();

    const token = safeText(state.token, "");

    if (!token) {
      const message =
        "No se ha encontrado un token de activación válido. Abre el enlace completo recibido por correo.";

      setStatus(ACTIVATE_ACCOUNT_STATUS.INVALID, {
        message,
        error: message,
      });

      if (!silent) {
        showToast(message, "error", "Token no válido");
      }

      return null;
    }

    const credentials = getActivationCredentials();

    if (!credentials.validation.ok) {
      setInlineError(credentials.validation.message);
      focusElementById(credentials.validation.fieldId);

      if (!silent) {
        showToast(
          credentials.validation.message,
          "error",
          "Revisa la contraseña"
        );
      }

      return null;
    }

    state.submitting = true;

    setStatus(ACTIVATE_ACCOUNT_STATUS.LOADING, {
      message: "Estamos guardando tu contraseña y activando tu cuenta.",
    });

    try {
      const response = await activateAccountRequest(
        token,
        {
          password: credentials.password,
          confirmPassword: credentials.confirmPassword,
        }
      );

      const message = resolveSuccessMessage(response);

      state.submitting = false;

      setStatus(ACTIVATE_ACCOUNT_STATUS.SUCCESS, {
        message,
        response,
      });

      showToast(message, "success", "Cuenta activada");

      return response;
    } catch (error) {
      state.submitting = false;

      const status = resolveErrorStatus(error);
      const message = resolveErrorMessage(error);

      setStatus(status, {
        message,
        error: message,
      });

      if (!silent) {
        showToast(message, "error", "No se pudo activar");
      }

      safeError("Activation failed:", {
        method: error?.method || "POST",
        endpoint: error?.endpoint || buildApiUrl(getActivationEndpoint()),
        code: error?.code || error?.error || "",
        status: error?.status || "",
        statusText: error?.statusText || "",
        message: error?.message || "",
      });

      return null;
    }
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function cleanupBindings() {
    try {
      cleanupBinding?.();
    } catch {}

    cleanupBinding = null;

    try {
      cleanupPasswordFields?.();
    } catch {}

    cleanupPasswordFields = null;

    state.bindingsAttached = false;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  function bind() {
    cleanupBindings();

    if (state.destroyed) {
      return;
    }

    const container = getContainer();

    if (!container) {
      return;
    }

    bindSharedPasswordFields(container);

    const form = container.querySelector("#activateAccountForm");
    const button = container.querySelector("#activateAccountButton");
    const toastClose = container.querySelector("#activateAccountToastClose");

    const getButtonAction = () =>
      safeText(
        button?.dataset?.action ||
          button?.getAttribute?.("data-action"),
        ""
      );

    const handlePrimaryAction = async (event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();

      const action = getButtonAction();

      if (action === "go-login") {
        await navigateToLogin();
        return;
      }

      await handleActivate({
        silent: false,
      });
    };

    const onSubmit = async (event) => {
      await handlePrimaryAction(event);
    };

    const onButtonClick = async (event) => {
      const action = getButtonAction();

      if (action === "go-login") {
        await handlePrimaryAction(event);
      }
    };

    const onToastClose = () => {
      const toast = document.getElementById("activateAccountToast");

      if (!toast) {
        return;
      }

      toast.classList.remove("is-visible");
      toast.hidden = true;
      toast.setAttribute("aria-hidden", "true");
    };

    try {
      form?.addEventListener?.("submit", onSubmit);
      button?.addEventListener?.("click", onButtonClick);
      toastClose?.addEventListener?.("click", onToastClose);
    } catch {}

    cleanupBinding = () => {
      try {
        form?.removeEventListener?.("submit", onSubmit);
      } catch {}

      try {
        button?.removeEventListener?.("click", onButtonClick);
      } catch {}

      try {
        toastClose?.removeEventListener?.("click", onToastClose);
      } catch {}
    };

    state.bindingsAttached = true;
  }

  /* =========================================================
     LIFECYCLE
  ========================================================= */

  async function init(viewContainer = null, context = null) {
    state.destroyed = false;
    state.lastContext = sanitizeContextForState(context);

    const capturedToken = extractTokenFromUrl(context);

    state.token = capturedToken;
    state.message = "";
    state.error = "";
    state.response = null;
    state.submitting = false;

    const urlScrubbed = capturedToken
      ? scrubActivationTokenFromUrl()
      : false;

    state.status = state.token
      ? ACTIVATE_ACCOUNT_STATUS.IDLE
      : ACTIVATE_ACCOUNT_STATUS.INVALID;

    if (!state.token) {
      state.message =
        "No se ha detectado token en la URL. El enlace esperado debe incluir el token, por ejemplo /activate-account/<token>.";
      state.error = state.message;
    }

    safeLog("init", {
      hasToken: Boolean(state.token),
      urlScrubbed,
      context: state.lastContext,
      apiBase: getApiBase(),
      activationEndpoint: getActivationEndpoint(),
      activationUrl: buildApiUrl(getActivationEndpoint()),
    });

    render(viewContainer);
    bind();

    return api;
  }

  function destroy() {
    state.destroyed = true;
    state.mounted = false;
    state.bindingsAttached = false;
    state.submitting = false;
    state.status = ACTIVATE_ACCOUNT_STATUS.IDLE;
    state.token = "";
    state.message = "";
    state.error = "";
    state.response = null;
    state.lastContext = null;

    abortActiveRequest();
    cleanupBindings();
    applyAuthLayoutMode(false);

    safeLog("destroy");
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    mount: init,

    destroy,
    unmount: destroy,

    render: rerender,
    activate: handleActivate,
    navigateToLogin,

    getState: () => ({
      mounted: state.mounted,
      destroyed: state.destroyed,
      bindingsAttached: state.bindingsAttached,
      submitting: state.submitting,

      status: state.status,
      token: state.token ? "***" : "",
      hasToken: Boolean(state.token),

      message: state.message,
      error: state.error,
      response: state.response,

      lastContext: state.lastContext,

      apiBase: getApiBase(),
      activationEndpoint: getActivationEndpoint(),
      activationUrl: buildApiUrl(getActivationEndpoint()),
    }),

    get mounted() {
      return state.mounted;
    },

    get destroyed() {
      return state.destroyed;
    },
  };

  return api;
})();

export default ActivateAccountView;

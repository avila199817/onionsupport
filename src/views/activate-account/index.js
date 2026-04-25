/* =========================================================
   Onion SPA - Activate Account View
   Archivo: src/views/activate-account/index.js

   Responsabilidades:
   - montar la vista pública de activación de cuenta
   - leer token desde URL normal, hash-router, history.state o contexto router
   - capturar token antes de limpiar la URL
   - limpiar token visible de la barra del navegador
   - no exponer token real en DOM
   - pedir contraseña nueva y confirmación antes de activar
   - reutilizar bindings compartidos de password-field
   - renderizar template premium alineado con login/reset-password
   - ejecutar activación contra backend
   - manejar estados idle/loading/success/error/expired/invalid
   - soportar navegación SPA de vuelta a login
   - limpiar listeners al destruir la vista
   - evitar doble submit y doble bind

   HARDENING EXTREMO:
   - endpoint alineado con AUTH_ENDPOINTS.activateAccount
   - token capturado desde contexto router aunque window.location ya esté limpio
   - password manual obligatorio
   - sin autosubmit
   - sin token real en inputs hidden
   - navegación login robusta
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

  const DEFAULT_ACTIVATION_ENDPOINT =
    AUTH_ENDPOINTS?.activateAccount ||
    getActivateAccountEndpoint?.() ||
    "/api/auth/activate-account";

  const CLEAN_ACTIVATION_PUBLIC_PATH = "/activate-account";
  const SCRUB_TOKEN_FROM_URL_AFTER_CAPTURE = true;
  const TEMPLATE_CAPTURED_TOKEN_SENTINEL = "__captured_activation_token__";

  const PASSWORD_MIN_LENGTH =
    Number(getActivationPasswordMinLength?.()) ||
    8;

  const TOKEN_PARAM_NAMES = [
    "token",
    "activationToken",
    "activateToken",
    "code",
    "t",
  ];

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
  let autoSubmitTimer = null;

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

  function getBaseOrigin() {
    if (isBrowser() && window.location?.origin) {
      return window.location.origin;
    }

    return "http://localhost";
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

  function getContainer() {
    if (!isBrowser()) {
      return null;
    }

    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function getApiBase() {
    return safeText(
      AppCore?.config?.apiBase ||
        AppCore?.config?.apiBaseUrl ||
        AppCore?.config?.baseApiUrl ||
        AppCore?.state?.config?.apiBase ||
        "",
      ""
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
    const left = safeText(base, "").replace(/\/+$/g, "");
    const right = safeText(path, "").replace(/^\/+/g, "");

    if (!left) {
      return `/${right}`;
    }

    if (!right) {
      return left;
    }

    return `${left}/${right}`;
  }

  function buildApiUrl(endpoint = "") {
    const value = safeText(endpoint, DEFAULT_ACTIVATION_ENDPOINT);

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (value.startsWith("/api/")) {
      return value;
    }

    const apiBase = getApiBase();

    if (apiBase) {
      return joinUrl(apiBase, value);
    }

    return joinUrl("/api", value);
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
    } catch {}

    return "";
  }

  function extractTokenFromRoutePath(pathname = "") {
    try {
      const normalized = normalizePathnameOnly(pathname);
      const parts = normalized.split("/").filter(Boolean);

      const index = parts.findIndex((part) => part === "activate-account");

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

      const fromQuery = getTokenFromSearchParams(query ? `?${query}` : "");

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

        const fromQuery = getTokenFromSearchParams(query ? `?${query}` : "");

        if (fromQuery) {
          return fromQuery;
        }

        return extractTokenFromRoutePath(raw.split("?")[0] || raw);
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

  function scrubActivationTokenFromUrl() {
    if (!SCRUB_TOKEN_FROM_URL_AFTER_CAPTURE) {
      return false;
    }

    if (!isBrowser()) {
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
        return false;
      }

      const cleanPath = CLEAN_ACTIVATION_PUBLIC_PATH;

      const currentState =
        window.history.state &&
        typeof window.history.state === "object"
          ? {
              ...window.history.state,
              path: cleanPath,
              publicPath: cleanPath,
              canonicalPath: cleanPath,
              searchAndHash: "",
              scrubbedActivationToken: true,
            }
          : {
              path: cleanPath,
              publicPath: cleanPath,
              canonicalPath: cleanPath,
              searchAndHash: "",
              scrubbedActivationToken: true,
            };

      window.history.replaceState(
        currentState,
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
        document.body.classList.toggle("auth-view-active", enabled);
        document.body.classList.toggle("login-view-active", enabled);
        document.body.dataset.authView = enabled ? "activate-account" : "";
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

  function clearAutoSubmitTimer() {
    if (!autoSubmitTimer) return;

    try {
      window.clearTimeout(autoSubmitTimer);
    } catch {}

    autoSubmitTimer = null;
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
      document.getElementById(id)?.focus?.();
      return true;
    } catch {
      return false;
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
      message.includes("inval")
    ) {
      return ACTIVATE_ACCOUNT_STATUS.INVALID;
    }

    return ACTIVATE_ACCOUNT_STATUS.ERROR;
  }

  function resolveErrorMessage(error = null) {
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

  function showToast(message = "", type = "info", title = "") {
    const text = safeText(message, "");

    if (!text) return false;

    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](text);
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.toast?.show === "function") {
        AppCore.toast.show(text, type);
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
      toast.setAttribute("aria-hidden", "false");
      toast.dataset.state = type;

      if (toastTitle) {
        toastTitle.textContent = safeText(
          title,
          type === "error" ? "Error" : "Aviso"
        );
      }

      toastText.textContent = text;

      const close = () => {
        toast.hidden = true;
        toast.setAttribute("aria-hidden", "true");
      };

      toastClose?.addEventListener?.("click", close, {
        once: true,
      });

      window.setTimeout(close, type === "error" ? 6500 : 4200);

      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     API REQUEST
  ========================================================= */

  async function requestWithAppHttp(endpoint = "", payload = {}) {
    const http =
      AppCore?.http ||
      AppCore?.Http ||
      AppCore?.services?.http ||
      AppCore?.modules?.Http ||
      null;

    if (!http) {
      return null;
    }

    if (typeof http.post === "function") {
      return await http.post(endpoint, payload, {
        auth: false,
        public: true,
      });
    }

    if (typeof http.request === "function") {
      return await http.request(endpoint, {
        method: "POST",
        auth: false,
        public: true,
        body: payload,
      });
    }

    if (typeof http.apiClient === "function") {
      return await http.apiClient(endpoint, {
        method: "POST",
        auth: false,
        public: true,
        body: payload,
      });
    }

    return null;
  }

  async function requestWithFetch(endpoint = "", payload = {}) {
    const url = buildApiUrl(endpoint);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    let data = null;

    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok || data?.ok === false) {
      const err = new Error(
        safeText(
          data?.message ||
            data?.error ||
            `HTTP_${response.status}`,
          "No se pudo activar la cuenta."
        )
      );

      err.status = response.status;
      err.code = data?.code || data?.error || `HTTP_${response.status}`;
      err.data = data;

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

    try {
      const httpResponse = await requestWithAppHttp(endpoint, payload);

      if (httpResponse) {
        if (httpResponse?.ok === false) {
          const err = new Error(
            safeText(
              httpResponse?.message || httpResponse?.error,
              "No se pudo activar la cuenta."
            )
          );

          err.code = httpResponse?.code || httpResponse?.error;
          err.data = httpResponse;

          throw err;
        }

        return httpResponse;
      }
    } catch (error) {
      throw error;
    }

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

  function render() {
    const container = getContainer();

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
    state.message = safeText(patch.message, state.message);
    state.error = safeText(patch.error, "");
    state.response = patch.response || state.response || null;

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

      window.dispatchEvent(
        new PopStateEvent("popstate")
      );

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
      setStatus(ACTIVATE_ACCOUNT_STATUS.INVALID, {
        message: "No se ha encontrado un token de activación válido.",
        error: "No se ha encontrado un token de activación válido.",
      });

      if (!silent) {
        showToast("No se ha encontrado un token de activación válido.", "error");
      }

      return null;
    }

    const credentials = getActivationCredentials();

    if (!credentials.validation.ok) {
      setInlineError(credentials.validation.message);
      focusElementById(credentials.validation.fieldId);

      if (!silent) {
        showToast(credentials.validation.message, "error", "Revisa la contraseña");
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

      safeError("Activation failed:", error);

      return null;
    }
  }

  function scheduleAutoSubmit() {
    clearAutoSubmitTimer();
    return false;
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

      if (!toast) return;

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
    state.lastContext = safeObject(context);

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

    safeLog("init", {
      hasToken: Boolean(state.token),
      urlScrubbed,
      contextPublicPath: safeText(context?.publicPath, ""),
      contextRequestedPath: safeText(context?.requestedPath, ""),
    });

    render();
    bind();
    scheduleAutoSubmit();

    return api;
  }

  function destroy() {
    state.destroyed = true;
    state.mounted = false;
    state.submitting = false;
    state.token = "";
    state.lastContext = null;

    clearAutoSubmitTimer();
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
      ...state,
      token: state.token ? "***" : "",
      hasToken: Boolean(state.token),
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

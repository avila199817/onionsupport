/* =========================================================
   Onion SPA - Activate Account View
   Archivo: src/views/activate-account/index.js

   Responsabilidades:
   - montar la vista pública de activación de cuenta
   - leer token desde URL normal o hash-router
   - renderizar template premium alineado con login/reset-password
   - ejecutar activación contra backend
   - manejar estados idle/loading/success/error/expired/invalid
   - soportar navegación SPA de vuelta a login
   - limpiar listeners al destruir la vista
   - evitar doble submit y doble bind
========================================================= */

import {
  getActivateAccountTemplate,
  ACTIVATE_ACCOUNT_STATUS,
} from "./activate-account.template.js";

import { AppCore } from "../../core/index.js";

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

  const DEFAULT_ACTIVATION_ENDPOINT = "/auth/activate-account";

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
  };

  let cleanupBinding = null;
  let autoSubmitTimer = null;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();

    return text || fallback;
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

  function getContainer() {
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
    return safeText(
      AppCore?.config?.activateAccountEndpoint ||
        AppCore?.config?.activationEndpoint ||
        AppCore?.config?.authActivateEndpoint ||
        window?.ONION_ACTIVATE_ACCOUNT_ENDPOINT ||
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

    const apiBase = getApiBase();

    if (apiBase) {
      return joinUrl(apiBase, value);
    }

    if (value.startsWith("/api/")) {
      return value;
    }

    return joinUrl("/api", value);
  }

  function getLocationSearchParams() {
    const params = new URLSearchParams();

    try {
      const directParams = new URLSearchParams(window.location.search || "");

      for (const [key, value] of directParams.entries()) {
        params.set(key, value);
      }
    } catch {}

    try {
      const hash = safeText(window.location.hash, "");
      const query = hash.includes("?") ? hash.split("?").slice(1).join("?") : "";

      if (query) {
        const hashParams = new URLSearchParams(query);

        for (const [key, value] of hashParams.entries()) {
          if (!params.has(key)) {
            params.set(key, value);
          }
        }
      }
    } catch {}

    return params;
  }

  function extractTokenFromPath() {
    try {
      const pathname = safeText(window.location.pathname, "");
      const parts = pathname.split("/").filter(Boolean);

      const index = parts.findIndex((part) => part === "activate-account");

      if (index >= 0 && parts[index + 1]) {
        return decodeURIComponent(parts[index + 1]);
      }
    } catch {}

    try {
      const hash = safeText(window.location.hash, "");
      const cleanHash = hash.replace(/^#\/?/, "");
      const pathOnly = cleanHash.split("?")[0] || "";
      const parts = pathOnly.split("/").filter(Boolean);

      const index = parts.findIndex((part) => part === "activate-account");

      if (index >= 0 && parts[index + 1]) {
        return decodeURIComponent(parts[index + 1]);
      }
    } catch {}

    return "";
  }

  function extractTokenFromUrl() {
    const params = getLocationSearchParams();

    for (const key of TOKEN_PARAM_NAMES) {
      const value = safeText(params.get(key), "");

      if (value) {
        return value;
      }
    }

    return extractTokenFromPath();
  }

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

      document.title = `${title} · ${DEFAULT_APP_NAME}`;
    } catch {}
  }

  function applyAuthLayoutMode(enabled = true) {
    try {
      document.body.classList.toggle("auth-view-active", enabled);
      document.body.classList.toggle("login-view-active", enabled);
      document.body.dataset.authView = enabled ? "activate-account" : "";
    } catch {}

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
    const message = safeText(error?.message || error?.data?.message, "").toLowerCase();

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
        toastTitle.textContent = safeText(title, type === "error" ? "Error" : "Aviso");
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
     API
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

  async function activateAccountRequest(token = "") {
    const cleanToken = safeText(token, "");

    if (!cleanToken) {
      const err = new Error("Falta el token de activación.");
      err.code = "ACTIVATION_TOKEN_MISSING";
      throw err;
    }

    const endpoint = getActivationEndpoint();

    const payload = {
      token: cleanToken,
      activationToken: cleanToken,
      activateToken: cleanToken,
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

  function getTemplateOptions() {
    return {
      appName: DEFAULT_APP_NAME,
      status: state.status,
      token: state.token,
      loginHref: DEFAULT_LOGIN_PATH,
      backHref: DEFAULT_LOGIN_PATH,
      autoSubmit: true,

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
        });
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.Router?.navigate === "function") {
        await AppCore.Router.navigate(target, {
          replaceState: true,
        });
        return true;
      }
    } catch {}

    try {
      if (typeof AppCore?.modules?.Router?.navigate === "function") {
        await AppCore.modules.Router.navigate(target, {
          replaceState: true,
        });
        return true;
      }
    } catch {}

    try {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
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

    state.submitting = true;

    setStatus(ACTIVATE_ACCOUNT_STATUS.LOADING, {
      message: "Estamos validando tu enlace de activación.",
    });

    try {
      const response = await activateAccountRequest(token);

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

    if (!state.token) return;
    if (state.status !== ACTIVATE_ACCOUNT_STATUS.IDLE) return;

    autoSubmitTimer = window.setTimeout(() => {
      void handleActivate({
        silent: true,
      });
    }, 250);
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function cleanupBindings() {
    try {
      cleanupBinding?.();
    } catch {}

    cleanupBinding = null;
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

    const form = container.querySelector("#activateAccountForm");
    const button = container.querySelector("#activateAccountButton");
    const backLink = container.querySelector("#activateAccountBackToLoginLink");
    const toastClose = container.querySelector("#activateAccountToastClose");

    const onSubmit = async (event) => {
      event.preventDefault();

      const action = safeText(
        button?.dataset?.action ||
          button?.getAttribute?.("data-action"),
        ""
      );

      if (action === "go-login") {
        await navigateToLogin();
        return;
      }

      await handleActivate({
        silent: false,
      });
    };

    const onBackClick = async (event) => {
      event.preventDefault();
      await navigateToLogin();
    };

    const onToastClose = () => {
      const toast = document.getElementById("activateAccountToast");

      if (!toast) return;

      toast.hidden = true;
      toast.setAttribute("aria-hidden", "true");
    };

    try {
      form?.addEventListener?.("submit", onSubmit);
      backLink?.addEventListener?.("click", onBackClick);
      toastClose?.addEventListener?.("click", onToastClose);
    } catch {}

    cleanupBinding = () => {
      try {
        form?.removeEventListener?.("submit", onSubmit);
      } catch {}

      try {
        backLink?.removeEventListener?.("click", onBackClick);
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

  async function init() {
    state.destroyed = false;
    state.token = extractTokenFromUrl();
    state.message = "";
    state.error = "";
    state.response = null;
    state.submitting = false;

    state.status = state.token
      ? ACTIVATE_ACCOUNT_STATUS.IDLE
      : ACTIVATE_ACCOUNT_STATUS.INVALID;

    safeLog("init", {
      hasToken: Boolean(state.token),
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

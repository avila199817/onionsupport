/* =========================================================
   Onion SPA - Reset Password View
   Archivo: src/views/password-reset/resetPasswordView.js

   RESET PASSWORD · VIEW REAL · AUTH FULLSCREEN · CSP CLEAN · 10/10

   RESPONSABILIDADES:
   - pintar pantalla de recuperación de acceso
   - activar modo fullscreen auth
   - validar identificador en cliente
   - enviar solicitud a Auth / handler resuelto
   - mostrar feedback visual mediante toast bridge
   - soportar usuario o email
   - redirigir correctamente tras success si aplica
   - evitar delays artificiales innecesarios
   - respetar layout auth premium
   - mantener cleanup completo de la vista
   - renderizar usando src/views/password-reset/reset-password.template.js

   HARDENING:
   - guards de browser
   - timers centralizados
   - navegación segura post-success
   - sync de modo auth estable
   - cleanup completo
   - handler resolution robusta
   - compatibilidad con router que prioriza init()
   - sin CSS inline
   - sin <style> inyectado
   - sin duplicidades visuales
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import { Router } from "../../router/index.js";

import { getResetPasswordTemplate } from "./reset-password.template.js";

import {
  loadRememberedIdentifier,
  createResetPasswordPayload,
  validateResetPasswordPayload,
  getFirstResetPasswordError,
  normalizeResetPasswordResult,
  resolveResetPasswordErrorMessage,
  resolveResetPasswordRedirect,
  buildResetPasswordSuccessMessage,
  persistResetPasswordIdentifier,
  safeText,
} from "./reset-password.helpers.js";

import {
  getResetPasswordRefs,
  clearResetPasswordErrors,
  applyResetPasswordErrors,
  setGlobalResetPasswordError,
  setResetPasswordLoading,
  setResetPasswordSuccessState,
  setResetPasswordNeutralState,
  focusResetPasswordPrimaryField,
  readResetPasswordFormState,
  bindResetPasswordInputClearers,
  bindResetPasswordSubmit,
  bindResetPasswordToastClose,
  bindResetPasswordBackLink,
  hideResetPasswordToast,
  shakeResetPasswordCard,
} from "./reset-password.dom.js";

import createResetPasswordToastBridge from "./toast.bridge.js";

export const ResetPasswordView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:reset-password";
  const RESET_ROUTE_PREFIX = "/reset-password";
  const LOGIN_ROUTE = "/login";

  const SUCCESS_REDIRECT_DELAY = 2200;

  /* =========================================================
     RUNTIME
  ========================================================= */

  let redirectTimerId = null;
  let isNavigatingAway = false;
  let isSubmitting = false;
  let localCleanup = null;

  /* =========================================================
     BASICS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeWarnLog(...args) {
    try {
      AppCore?.utils?.warn?.("[ResetPasswordView]", ...args);
      return;
    } catch {}

    try {
      console.warn("[ResetPasswordView]", ...args);
    } catch {}
  }

  function safeErrorLog(...args) {
    try {
      AppCore?.utils?.error?.("[ResetPasswordView]", ...args);
      return;
    } catch {}

    try {
      console.error("[ResetPasswordView]", ...args);
    } catch {}
  }

  function safeEmit(eventName = "", payload = {}) {
    const name = safeText(eventName, "");
    if (!name) return false;

    let emitted = false;

    try {
      AppCore?.events?.emit?.(name, payload);
      emitted = true;
    } catch {}

    try {
      if (isBrowser()) {
        window.dispatchEvent(
          new CustomEvent(name, {
            detail: payload,
          })
        );

        emitted = true;
      }
    } catch {}

    return emitted;
  }

  function isPlainObject(value) {
    return (
      value !== null &&
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
      return isPlainObject(arg2) ? arg2 : {};
    }

    return isPlainObject(arg1) ? arg1 : {};
  }

  /* =========================================================
     TIMERS / CLEANUP
  ========================================================= */

  function clearRedirectTimer() {
    if (!redirectTimerId || !isBrowser()) {
      redirectTimerId = null;
      return;
    }

    try {
      window.clearTimeout(redirectTimerId);
    } catch {}

    redirectTimerId = null;
  }

  function runLocalCleanup() {
    try {
      localCleanup?.();
    } catch {}

    localCleanup = null;
  }

  function destroyViewState({
    preserveToast = false,
  } = {}) {
    clearRedirectTimer();

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}

    runLocalCleanup();

    if (!preserveToast) {
      const container = getContainer();

      if (container) {
        try {
          const refs = getResetPasswordRefs(container);
          hideResetPasswordToast(refs);
        } catch {}
      }
    }
  }

  /* =========================================================
     DOM / CONTAINER
  ========================================================= */

  function getContainer() {
    if (!isBrowser()) {
      return null;
    }

    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.querySelector("#view-container") ||
      null
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
        document.getElementById("sidebar") ||
        document.getElementById("sidebar-mount"),

      topbar:
        AppCore?.dom?.topbar ||
        document.getElementById("topbar") ||
        document.getElementById("topbar-mount") ||
        document.querySelector(".topbar"),

      topbarViewContainer:
        AppCore?.dom?.topbarViewContainer ||
        document.getElementById("topbarview-container") ||
        document.getElementById("topbar-view-container"),

      tableheadContainer:
        AppCore?.dom?.tableheadContainer ||
        document.getElementById("tablehead-container") ||
        document.querySelector(".table-head"),
    };
  }

  /* =========================================================
     SHELL / AUTH MODE
  ========================================================= */

  function setElementHidden(element, hidden) {
    if (!element) return;

    try {
      element.hidden = Boolean(hidden);
    } catch {}

    try {
      element.setAttribute("aria-hidden", hidden ? "true" : "false");
    } catch {}
  }

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

    setElementHidden(sidebar, enabled);
    setElementHidden(topbar, enabled);
    setElementHidden(topbarViewContainer, enabled);
    setElementHidden(tableheadContainer, enabled);
  }

  function forceHideGlobalLoader() {
    if (!isBrowser()) {
      return;
    }

    const loader =
      AppCore?.dom?.loader ||
      document.getElementById("app-loader") ||
      document.querySelector("[data-app-loader]");

    try {
      if (typeof AppCore?.setLoading === "function") {
        AppCore.setLoading(false);
      }
    } catch {}

    try {
      document.body?.classList?.remove?.(
        "loading",
        "is-loading",
        "app-loading"
      );
    } catch {}

    if (!loader) {
      return;
    }

    try {
      loader.hidden = true;
      loader.setAttribute("aria-hidden", "true");
      loader.setAttribute("data-auth-forced-hidden", "true");
    } catch {}
  }

  function restoreGlobalLoaderState() {
    if (!isBrowser()) {
      return;
    }

    const loader =
      AppCore?.dom?.loader ||
      document.getElementById("app-loader") ||
      document.querySelector("[data-app-loader]");

    if (!loader) {
      return;
    }

    try {
      loader.removeAttribute("data-auth-forced-hidden");
      loader.setAttribute("aria-hidden", "true");

      if (!document.body?.classList?.contains?.("loading")) {
        loader.hidden = true;
      }
    } catch {}
  }

  /* =========================================================
     ROUTING
  ========================================================= */

  function normalizePath(path = "/") {
    const raw = safeText(path, "/") || "/";

    try {
      if (typeof AppCore?.utils?.normalizePath === "function") {
        const normalized = AppCore.utils.normalizePath(raw);
        if (normalized) return normalized;
      }
    } catch {}

    if (raw === "/") {
      return "/";
    }

    return (
      raw
        .replace(/\/{2,}/g, "/")
        .replace(/\/+$/g, "") || "/"
    );
  }

  function getCurrentBrowserPath() {
    if (!isBrowser()) {
      return "/";
    }

    try {
      return normalizePath(
        `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
      );
    } catch {
      return "/";
    }
  }

  function getCleanPath(path = "/") {
    return normalizePath(path)
      .split("?")[0]
      .split("#")[0] || "/";
  }

  function isResetPasswordPath(path = "") {
    const clean = getCleanPath(path);

    return (
      clean === RESET_ROUTE_PREFIX ||
      clean.startsWith(`${RESET_ROUTE_PREFIX}/`)
    );
  }

  function navigateTo(path = LOGIN_ROUTE) {
    if (!isBrowser()) {
      return;
    }

    const target = normalizePath(path || LOGIN_ROUTE);

    setAuthScreen(false);
    forceHideGlobalLoader();

    if (typeof Router?.navigate === "function") {
      Router.navigate(target, {
        replaceState: true,
        force: true,
      });
      return;
    }

    if (typeof AppCore?.navigate === "function") {
      AppCore.navigate(target);
      return;
    }

    if (typeof AppCore?.router?.navigate === "function") {
      AppCore.router.navigate(target);
      return;
    }

    window.location.assign(target);
  }

  function navigateSoon(path = LOGIN_ROUTE, delay = 0) {
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
    const payload = {
      route: RESET_ROUTE_PREFIX,
      path: RESET_ROUTE_PREFIX,
      canonicalPath: RESET_ROUTE_PREFIX,
      view: "reset-password",
      source: "ResetPasswordView",
    };

    safeEmit("app:route:rendered", payload);
    safeEmit("router:rendered", payload);
  }

  /* =========================================================
     RESOLUTION
  ========================================================= */

  function resolveAppName() {
    return (
      safeText(AppCore?.config?.appName, "") ||
      "Onion Support"
    );
  }

  function createExecutorCandidate(fn, ctx = null) {
    if (typeof fn !== "function") {
      return null;
    }

    return async function executeResetPassword(payload) {
      return fn.call(ctx, payload);
    };
  }

  function resolveExecutor(deps = {}) {
    const candidates = [
      createExecutorCandidate(deps.onSubmit, deps),
      createExecutorCandidate(deps.submitResetPassword, deps),
      createExecutorCandidate(deps.requestResetPassword, deps),
      createExecutorCandidate(deps.resetPassword, deps),

      createExecutorCandidate(Auth?.requestPasswordReset, Auth),
      createExecutorCandidate(Auth?.resetPasswordRequest, Auth),
      createExecutorCandidate(Auth?.forgotPassword, Auth),

      createExecutorCandidate(AppCore?.services?.auth?.requestPasswordReset, AppCore?.services?.auth),
      createExecutorCandidate(AppCore?.services?.auth?.resetPasswordRequest, AppCore?.services?.auth),
      createExecutorCandidate(AppCore?.services?.auth?.forgotPassword, AppCore?.services?.auth),

      createExecutorCandidate(AppCore?.auth?.requestPasswordReset, AppCore?.auth),
      createExecutorCandidate(AppCore?.auth?.resetPasswordRequest, AppCore?.auth),
      createExecutorCandidate(AppCore?.auth?.forgotPassword, AppCore?.auth),
    ].filter(Boolean);

    return candidates[0] || null;
  }

  /* =========================================================
     SUCCESS / ERROR FLOW
  ========================================================= */

  function handleValidationError(refs, toast, errors = {}) {
    applyResetPasswordErrors(refs, errors);

    const message =
      getFirstResetPasswordError(errors) ||
      "Revisa el formulario.";

    toast.error(message);
    shakeResetPasswordCard(refs);

    return false;
  }

  function handleRequestError(refs, toast, error) {
    const message =
      resolveResetPasswordErrorMessage(error);

    setGlobalResetPasswordError(refs, message);
    toast.error(message);
    shakeResetPasswordCard(refs);

    safeEmit("auth:reset-password:error", {
      message,
      error,
      source: "ResetPasswordView",
    });

    safeErrorLog("reset error", error);
  }

  function handleCooldown(refs, toast, result) {
    setResetPasswordNeutralState(refs, {
      submitLabel: "Enviar enlace",
    });

    toast.warning(
      result?.message || "Espera antes de volver a intentarlo."
    );

    safeEmit("auth:reset-password:cooldown", {
      result,
      source: "ResetPasswordView",
    });
  }

  function handleSuccess(refs, toast, result, deps = {}) {
    const successMessage =
      buildResetPasswordSuccessMessage(result);

    setResetPasswordSuccessState(refs, {
      title: "Solicitud enviada",
      message: successMessage,
    });

    toast.success(successMessage);

    const redirectTo =
      resolveResetPasswordRedirect(result, deps);

    safeEmit("auth:reset-password:success", {
      result,
      redirectTo,
      source: "ResetPasswordView",
    });

    const shouldRedirect =
      deps.redirectAfterSuccess === true;

    if (!shouldRedirect) {
      return;
    }

    isNavigatingAway = true;

    navigateSoon(
      redirectTo,
      Number(deps.redirectDelay) || SUCCESS_REDIRECT_DELAY
    );
  }

  /* =========================================================
     RENDER CORE
  ========================================================= */

  function buildTemplateOptions(deps = {}) {
    const appName = resolveAppName();
    const rememberedIdentifier = loadRememberedIdentifier();

    return {
      appName,
      rememberedIdentifier,

      heroEyebrow: "ONION SUPPORT · RECUPERACIÓN PROTEGIDA",
      heroTitle: "Recuperación segura del acceso al panel",
      bullets: [
        "Validación segura de usuario o email",
        "Flujo protegido desacoplado del acceso principal",
        "Recuperación guiada alineada al entorno operativo",
      ],

      title: "Recuperar acceso",
      subtitle: `Recuperar acceso a ${appName}`,
      submitLabel: "Enviar enlace",
      backLabel: "Volver al acceso",
      backHref: LOGIN_ROUTE,
      footerText:
        "Entorno protegido. Usa un identificador válido de tu cuenta corporativa.",

      ...deps,
    };
  }

  function runRender(deps = {}) {
    const container = getContainer();

    if (!container) {
      safeWarnLog(
        "No se encontró #view-container para renderizar."
      );

      forceHideGlobalLoader();

      return {
        ok: false,
        missingContainer: true,
      };
    }

    isNavigatingAway = false;
    isSubmitting = false;

    destroyViewState({
      preserveToast: false,
    });

    setAuthScreen(true);

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    try {
      AppCore?.setDocumentTitle?.("Recuperar acceso");
    } catch {}

    container.innerHTML =
      getResetPasswordTemplate(
        buildTemplateOptions(deps)
      );

    forceHideGlobalLoader();
    bind(deps);
    emitRouteRendered();

    return {
      ok: true,
      view: "reset-password",
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
    const refs = getResetPasswordRefs(container);

    if (!refs?.form || !refs?.identifierInput || !refs?.submitButton) {
      safeWarnLog(
        "Faltan nodos críticos del formulario."
      );

      forceHideGlobalLoader();
      return;
    }

    const cleanups = [];

    const toast =
      deps.toast ||
      createResetPasswordToastBridge(refs);

    try {
      toast.init?.();
    } catch {}

    const executeReset = resolveExecutor(deps);

    const submitLabel =
      safeText(deps.submitLabel, "") ||
      "Enviar enlace";

    const loadingLabel =
      safeText(deps.loadingLabel, "") ||
      "Enviando...";

    function resetNeutral() {
      clearResetPasswordErrors(refs);

      setResetPasswordNeutralState(refs, {
        submitLabel,
      });
    }

    function onBack(event) {
      event.preventDefault();

      if (isSubmitting || isNavigatingAway) {
        return;
      }

      isNavigatingAway = true;

      navigateTo(
        safeText(deps.backHref, "") || LOGIN_ROUTE
      );
    }

    function onToastClose() {
      if (isSubmitting && isNavigatingAway) {
        return;
      }

      try {
        toast.dismiss?.();
      } catch {}
    }

    async function onSubmit(event) {
      event.preventDefault();

      if (isSubmitting || isNavigatingAway) {
        return;
      }

      clearResetPasswordErrors(refs);

      try {
        toast.dismiss?.();
      } catch {}

      const formState =
        readResetPasswordFormState(refs);

      const payload =
        createResetPasswordPayload(formState);

      const errors =
        validateResetPasswordPayload(payload);

      if (Object.keys(errors).length > 0) {
        handleValidationError(refs, toast, errors);
        return;
      }

      if (!executeReset) {
        handleRequestError(
          refs,
          toast,
          new Error("No se encontró handler de recuperación.")
        );

        return;
      }

      persistResetPasswordIdentifier(
        payload.identifier
      );

      isSubmitting = true;

      setResetPasswordLoading(refs, true, {
        submitLabel,
        loadingLabel,
      });

      let loadingId = null;

      try {
        loadingId = toast.loading?.(
          "Procesando recuperación de acceso...",
          {
            persist: true,
          }
        );

        const rawResult =
          await executeReset(payload);

        const result =
          normalizeResetPasswordResult(rawResult);

        toast.dismiss?.(loadingId);

        if (result.cooldown) {
          handleCooldown(refs, toast, result);
          return;
        }

        if (!result.ok) {
          throw result;
        }

        handleSuccess(refs, toast, result, deps);
      } catch (error) {
        toast.dismiss?.(loadingId);

        handleRequestError(refs, toast, error);

        setResetPasswordLoading(refs, false, {
          submitLabel,
          loadingLabel,
        });
      } finally {
        if (!isNavigatingAway) {
          isSubmitting = false;

          if (!refs?.form?.hasAttribute("data-success")) {
            setResetPasswordLoading(refs, false, {
              submitLabel,
              loadingLabel,
            });
          }
        }
      }
    }

    resetNeutral();

    focusResetPasswordPrimaryField(refs, {
      rememberedIdentifier: loadRememberedIdentifier(),
    });

    forceHideGlobalLoader();

    cleanups.push(
      bindResetPasswordInputClearers(refs, resetNeutral)
    );

    cleanups.push(
      bindResetPasswordSubmit(refs, onSubmit)
    );

    cleanups.push(
      bindResetPasswordToastClose(refs, onToastClose)
    );

    cleanups.push(
      bindResetPasswordBackLink(refs, onBack)
    );

    try {
      AppCore?.cleanup?.event?.(
        scope,
        "router:before-render",
        ({ detail } = {}) => {
          const nextPath =
            detail?.path ||
            detail?.canonicalPath ||
            "";

          if (
            nextPath &&
            !isResetPasswordPath(nextPath)
          ) {
            setAuthScreen(false);
          }
        }
      );
    } catch {}

    const cleanup = () => {
      for (const unbind of cleanups) {
        try {
          unbind?.();
        } catch {}
      }

      clearRedirectTimer();

      if (!isNavigatingAway) {
        try {
          toast.dismiss?.();
        } catch {}

        hideResetPasswordToast(refs);
        setAuthScreen(false);
        restoreGlobalLoaderState();
      }
    };

    localCleanup = cleanup;

    try {
      AppCore?.cleanup?.add?.(scope, () => {
        cleanup();
        localCleanup = null;
      });
    } catch {}
  }

  /* =========================================================
     PUBLIC API
  ========================================================= */

  function init(arg1 = {}, arg2 = {}) {
    const deps = resolveDeps(arg1, arg2);
    return runRender(deps);
  }

  function render(arg1 = {}, arg2 = {}) {
    const deps = resolveDeps(arg1, arg2);
    return runRender(deps);
  }

  function destroy() {
    isNavigatingAway = false;
    isSubmitting = false;

    destroyViewState({
      preserveToast: false,
    });

    setAuthScreen(false);
    restoreGlobalLoaderState();
  }

  return {
    init,
    render,
    destroy,
  };
})();

export default ResetPasswordView;

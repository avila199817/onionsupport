/* =========================================================
   Onion SPA - Reset Password View (FULL PRO SAAS PANEL · GOD MODE)
   Archivo: src/views/password-reset/resetPasswordView.js

   Responsabilidades:
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

  const SCOPE = "view:reset-password";

  const SUCCESS_REDIRECT_DELAY = 2200;
  const RESET_ROUTE_PREFIX = "/reset-password";

  let redirectTimerId = null;
  let isNavigatingAway = false;
  let isSubmitting = false;

  /* =========================================================
     BASICS
  ========================================================= */
  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
    );
  }

  function safeErrorLog(...args) {
    try {
      AppCore?.utils?.error?.(...args);
    } catch {}
  }

  function safeWarnLog(...args) {
    try {
      AppCore?.utils?.warn?.(...args);
    } catch {}
  }

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(eventName, payload);
    } catch {}
  }

  function clearRedirectTimer() {
    if (!redirectTimerId || !isBrowser()) {
      return;
    }

    window.clearTimeout(redirectTimerId);
    redirectTimerId = null;
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
     SHELL / AUTH MODE
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
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }

    if (sidebar) {
      sidebar.hidden = enabled;
    }

    if (topbar) {
      topbar.hidden = enabled;
    }

    if (topbarViewContainer) {
      topbarViewContainer.hidden = enabled;
    }

    if (tableheadContainer) {
      tableheadContainer.hidden = enabled;
    }
  }

  function forceHideGlobalLoader() {
    if (!isBrowser()) {
      return;
    }

    const loader =
      AppCore?.dom?.loader ||
      document.getElementById("app-loader");

    if (typeof AppCore?.setLoading === "function") {
      AppCore.setLoading(false);
    }

    if (document?.body) {
      document.body.classList.remove("loading");
    }

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
     ROUTING
  ========================================================= */
  function normalizePath(path = "/") {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      try {
        return AppCore.utils.normalizePath(path);
      } catch {}
    }

    const value = String(path || "/").trim() || "/";

    if (value === "/") {
      return "/";
    }

    return value
      .replace(/\/{2,}/g, "/")
      .replace(/\/+$/g, "") || "/";
  }

  function navigateTo(path = "/login") {
    const target = normalizePath(path || "/login");

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

  function navigateSoon(path = "/login", delay = 0) {
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
      route: "/reset-password",
      view: "reset-password",
    });
  }

  /* =========================================================
     RESOLUTION
  ========================================================= */
  function resolveAppName() {
    return (
      safeText(
        AppCore?.config?.appName,
        ""
      ) || "Onion Support"
    );
  }

  function resolveExecutor(deps = {}) {
    const candidates = [
      deps.onSubmit,
      deps.submitResetPassword,
      deps.requestResetPassword,
      deps.resetPassword,
      Auth?.requestPasswordReset,
      Auth?.resetPasswordRequest,
      Auth?.forgotPassword,
      AppCore?.services?.auth?.requestPasswordReset,
      AppCore?.services?.auth?.resetPasswordRequest,
      AppCore?.services?.auth?.forgotPassword,
      AppCore?.auth?.requestPasswordReset,
      AppCore?.auth?.resetPasswordRequest,
      AppCore?.auth?.forgotPassword,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "function") {
        return candidate;
      }
    }

    return null;
  }

  /* =========================================================
     VIEW STATE
  ========================================================= */
  function destroyViewState({
    preserveToast = false,
  } = {}) {
    clearRedirectTimer();
    AppCore?.cleanup?.run?.(SCOPE);

    if (!preserveToast) {
      const container = getContainer();

      if (container) {
        const refs = getResetPasswordRefs(container);
        hideResetPasswordToast(refs);
      }
    }
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
    });

    safeErrorLog("[ResetPasswordView] reset error", error);
  }

  function handleCooldown(refs, toast, result) {
    setResetPasswordNeutralState(refs, {
      submitLabel: "Enviar enlace",
    });

    toast.warning(result.message || "Espera antes de volver a intentarlo.");
  }

  function handleSuccess(refs, toast, result, deps = {}) {
    const successMessage =
      buildResetPasswordSuccessMessage(result);

    setResetPasswordSuccessState(refs, {
      title: "Solicitud enviada",
      message: successMessage,
    });

    toast.success(successMessage);

    safeEmit("auth:reset-password:success", {
      result,
      redirectTo: resolveResetPasswordRedirect(result, deps),
    });

    const shouldRedirect =
      deps.redirectAfterSuccess === true;

    if (!shouldRedirect) {
      return;
    }

    isNavigatingAway = true;

    navigateSoon(
      resolveResetPasswordRedirect(result, deps),
      Number(deps.redirectDelay) || SUCCESS_REDIRECT_DELAY
    );
  }

  /* =========================================================
     RENDER
  ========================================================= */
  function render(deps = {}) {
    const container = getContainer();

    if (!container) {
      safeWarnLog(
        "ResetPasswordView: no se encontró #view-container para renderizar."
      );
      forceHideGlobalLoader();
      return;
    }

    isNavigatingAway = false;
    isSubmitting = false;

    destroyViewState({
      preserveToast: false,
    });

    restoreGlobalLoaderStyles();
    setAuthScreen(true);

    AppCore?.clearDynamicContainers?.();
    AppCore?.setDocumentTitle?.("Recuperar acceso");

    const appName = resolveAppName();
    const rememberedIdentifier = loadRememberedIdentifier();

    container.innerHTML =
      getResetPasswordTemplate({
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
        backHref: "/login",
        footerText:
          "Entorno protegido. Usa un identificador válido de tu cuenta corporativa.",
        ...deps,
      });

    forceHideGlobalLoader();
    bind(deps);
  }

  /* =========================================================
     BIND
  ========================================================= */
  function bind(deps = {}) {
    if (!isBrowser()) {
      return;
    }

    const scope = AppCore?.cleanup?.scope?.(SCOPE);
    const container = getContainer();
    const refs = getResetPasswordRefs(container);

    if (!scope || !refs?.form || !refs?.identifierInput || !refs?.submitButton) {
      safeWarnLog(
        "ResetPasswordView: faltan nodos críticos del formulario."
      );
      forceHideGlobalLoader();
      return;
    }

    const toast =
      deps.toast ||
      createResetPasswordToastBridge(refs);

    toast.init?.();

    const executeReset = resolveExecutor(deps);

    const submitLabel =
      safeText(deps.submitLabel, "") ||
      "Enviar enlace";

    const loadingLabel =
      safeText(deps.loadingLabel, "") ||
      "Enviando...";

    setResetPasswordNeutralState(refs, {
      submitLabel,
    });

    focusResetPasswordPrimaryField(refs, {
      rememberedIdentifier: loadRememberedIdentifier(),
    });

    forceHideGlobalLoader();

    if (!executeReset) {
      const message =
        "No se encontró handler de recuperación.";

      setGlobalResetPasswordError(refs, message);
      toast.error(message);

      emitRouteRendered();

      AppCore.cleanup.add(scope, () => {
        hideResetPasswordToast(refs);
        setAuthScreen(false);
        restoreGlobalLoaderStyles();
      });

      return;
    }

    const onClearErrors = () => {
      clearResetPasswordErrors(refs);
      setResetPasswordNeutralState(refs, {
        submitLabel,
      });
    };

    const onBack = (event) => {
      event.preventDefault();

      if (isSubmitting || isNavigatingAway) {
        return;
      }

      navigateTo(
        safeText(deps.backHref, "") || "/login"
      );
    };

    const onToastClose = () => {
      if (isSubmitting && isNavigatingAway) {
        return;
      }

      toast.dismiss?.();
    };

    const onSubmit = async (event) => {
      event.preventDefault();

      if (isSubmitting || isNavigatingAway) {
        return;
      }

      clearResetPasswordErrors(refs);
      toast.dismiss?.();

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
    };

    const unbindInputs =
      bindResetPasswordInputClearers(refs, onClearErrors);

    const unbindSubmit =
      bindResetPasswordSubmit(refs, onSubmit);

    const unbindToastClose =
      bindResetPasswordToastClose(refs, onToastClose);

    const unbindBack =
      bindResetPasswordBackLink(refs, onBack);

    AppCore.cleanup.event(
      scope,
      "router:before-render",
      ({ detail }) => {
        const nextPath =
          detail?.path ||
          detail?.canonicalPath ||
          "";

        if (
          nextPath &&
          !String(nextPath).startsWith(RESET_ROUTE_PREFIX)
        ) {
          setAuthScreen(false);
        }
      }
    );

    AppCore.cleanup.add(scope, () => {
      unbindInputs?.();
      unbindSubmit?.();
      unbindToastClose?.();
      unbindBack?.();

      clearRedirectTimer();

      if (!isNavigatingAway) {
        toast.dismiss?.();
        hideResetPasswordToast(refs);
        setAuthScreen(false);
        restoreGlobalLoaderStyles();
      }
    });

    emitRouteRendered();
  }

  /* =========================================================
     API PÚBLICA
  ========================================================= */
  return {
    render,
  };
})();

export default ResetPasswordView;

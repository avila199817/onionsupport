/* =========================================================
   Onion SPA - Reset Password Confirm View (FULL PRO SAAS PANEL)
   Archivo: src/views/password-reset/confirm/confirmView.js
========================================================= */

import { AppCore } from "../../../core/index.js";
import { Auth } from "../../../features/auth/index.js";
import { Router } from "../../../router/index.js";

import { getConfirmTemplate } from "./confirm.template.js";

import {
  getUrlToken,
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

export const ConfirmResetPasswordView = (() => {
  "use strict";

  const SCOPE = "view:reset-password-confirm";
  const CONFIRM_ROUTE_PREFIX = "/reset-password/confirm";
  const SUCCESS_REDIRECT_DELAY = 1800;

  let redirectTimerId = null;
  let isSubmitting = false;
  let isNavigatingAway = false;

  /* FIX CRÍTICO TOKEN */
  let stableToken = "";

  /* =========================================================
     BASICS
  ========================================================= */

  function isBrowser() {
    return (
      typeof window !== "undefined" &&
      typeof document !== "undefined"
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
      return arg2 && typeof arg2 === "object"
        ? arg2
        : {};
    }

    return arg1 && typeof arg1 === "object"
      ? arg1
      : {};
  }

  function safeEmit(eventName, payload = {}) {
    try {
      AppCore?.events?.emit?.(
        eventName,
        payload
      );
    } catch {}
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

  function clearRedirectTimer() {
    if (!redirectTimerId || !isBrowser()) {
      return;
    }

    window.clearTimeout(redirectTimerId);
    redirectTimerId = null;
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
        document.getElementById(
          "topbarview-container"
        ),

      tableheadContainer:
        AppCore?.dom?.tableheadContainer ||
        document.getElementById(
          "tablehead-container"
        ),
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

    document.body.classList.toggle(
      "auth-screen",
      enabled
    );

    document.body.classList.toggle(
      "route-auth",
      enabled
    );

    document.body.classList.toggle(
      "route-shell-hidden",
      enabled
    );

    document.body.classList.toggle(
      "login-no-scroll",
      enabled
    );

    if (enabled) {
      document.documentElement.style.overflow =
        "hidden";
      document.body.style.overflow =
        "hidden";
    } else {
      document.documentElement.style.overflow =
        "";
      document.body.style.overflow = "";
    }

    if (sidebar) sidebar.hidden = enabled;
    if (topbar) topbar.hidden = enabled;
    if (topbarViewContainer)
      topbarViewContainer.hidden = enabled;
    if (tableheadContainer)
      tableheadContainer.hidden = enabled;
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

    AppCore?.setLoading?.(false);

    document.body?.classList.remove("loading");

    if (!loader) {
      return;
    }

    loader.hidden = true;
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
    loader.style.display = "";
    loader.style.opacity = "";
    loader.style.visibility = "";
    loader.style.pointerEvents = "";
  }

  /* =========================================================
     ROUTING
  ========================================================= */

  function normalizePath(path = "/login") {
    if (
      typeof AppCore?.utils?.normalizePath ===
      "function"
    ) {
      try {
        return AppCore.utils.normalizePath(path);
      } catch {}
    }

    const value =
      String(path || "/login").trim() ||
      "/login";

    if (value === "/") {
      return "/";
    }

    return (
      value
        .replace(/\/{2,}/g, "/")
        .replace(/\/+$/g, "") || "/"
    );
  }

  function navigateTo(path = "/login") {
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

    if (typeof AppCore?.navigate === "function") {
      AppCore.navigate(target);
      return;
    }

    window.location.assign(target);
  }

  function navigateSoon(
    path = "/login",
    delay = 0
  ) {
    if (!isBrowser()) {
      return;
    }

    clearRedirectTimer();

    const safeDelay = Math.max(
      0,
      Number(delay) || 0
    );

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
      route: "/reset-password/confirm",
      view: "reset-password-confirm",
    });
  }

  /* =========================================================
     EXECUTOR
  ========================================================= */

  function resolveExecutor(deps = {}) {
    const candidates = [
      deps.onSubmit,
      deps.submitConfirmReset,
      deps.confirmResetPassword,
      deps.resetPasswordConfirm,
      Auth?.confirmResetPassword,
      Auth?.resetPasswordConfirm,
      AppCore?.services?.auth
        ?.confirmResetPassword,
      AppCore?.auth?.confirmResetPassword,
    ];

    for (const fn of candidates) {
      if (typeof fn === "function") {
        return fn;
      }
    }

    return null;
  }

  /* =========================================================
     CLEANUP
  ========================================================= */

  function destroyViewState() {
    clearRedirectTimer();
    AppCore?.cleanup?.run?.(SCOPE);
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function runRender(deps = {}) {
    const container = getContainer();

    if (!container) {
      safeWarnLog(
        "ConfirmResetPasswordView: no view-container."
      );

      forceHideGlobalLoader();

      return {
        ok: false,
        missingContainer: true,
      };
    }

    isSubmitting = false;
    isNavigatingAway = false;

    destroyViewState();
    restoreGlobalLoaderStyles();
    setAuthScreen(true);

    AppCore?.clearDynamicContainers?.();
    AppCore?.setDocumentTitle?.(
      "Nueva contraseña"
    );

    const appName =
      safeText(
        AppCore?.config?.appName,
        ""
      ) || "Onion Support";

    /* FIX TOKEN */
    stableToken =
      safeText(deps.token, "") ||
      getUrlToken();

    container.innerHTML = getConfirmTemplate({
      appName,
      token: stableToken,

      heroEyebrow:
        "ONION SUPPORT · NUEVA CONTRASEÑA",

      heroTitle:
        "Configura una contraseña nueva de forma segura",

      bullets: [
        "Enlace temporal validado para cambio de contraseña",
        "Actualización segura de credenciales de acceso",
        "Flujo protegido alineado al entorno corporativo",
      ],

      title: "Crear nueva contraseña",

      subtitle: `Define una contraseña nueva para tu cuenta de ${appName}`,

      submitLabel:
        "Actualizar contraseña",

      backLabel:
        "Volver al acceso",

      backHref: "/login",

      ...deps,
    });

    forceHideGlobalLoader();
    bind(deps);

    return {
      ok: true,
      view: "reset-password-confirm",
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
      AppCore?.cleanup?.scope?.(SCOPE);

    const container = getContainer();
    const refs = getConfirmRefs(container);

    if (
      !scope ||
      !refs?.form ||
      !refs?.passwordInput ||
      !refs?.confirmPasswordInput
    ) {
      safeWarnLog(
        "ConfirmResetPasswordView: nodos críticos ausentes."
      );

      forceHideGlobalLoader();
      return;
    }

    const toast =
      deps.toast ||
      createResetPasswordToastBridge(refs);

    toast.init?.();

    const executeConfirm =
      resolveExecutor(deps);

    const submitLabel =
      safeText(
        deps.submitLabel,
        ""
      ) || "Actualizar contraseña";

    const loadingLabel =
      safeText(
        deps.loadingLabel,
        ""
      ) || "Procesando...";

    setConfirmLoading(refs, false, {
      submitLabel,
      loadingLabel,
    });

    focusConfirmPrimaryField(refs);
    forceHideGlobalLoader();

    if (!executeConfirm) {
      const message =
        "No se encontró handler de confirmación.";

      setGlobalConfirmError(refs, message);
      toast.error?.(message);

      emitRouteRendered();

      return;
    }

    const onSubmit = async (event) => {
      event.preventDefault();

      if (
        isSubmitting ||
        isNavigatingAway
      ) {
        return;
      }

      clearConfirmErrors(refs);
      toast.dismiss?.();

      const formState =
        readConfirmFormState(refs);

      /* FIX TOKEN DEFINITIVO */
      const payload =
        createConfirmPayload({
          token:
            safeText(
              formState.token,
              ""
            ) || stableToken,

          password:
            safeText(
              formState.newPassword,
              ""
            ) ||
            safeText(
              formState.password,
              ""
            ),

          confirmPassword:
            formState.confirmPassword,
        });

      const errors =
        validateConfirmPayload(payload);

      if (
        Object.keys(errors).length > 0
      ) {
        const firstError =
          getFirstConfirmError(errors);

        applyConfirmErrors(
          refs,
          errors
        );

        setGlobalConfirmError(
          refs,
          firstError
        );

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
        loadingId =
          toast.loading?.(
            "Actualizando contraseña...",
            { persist: true }
          );

        const rawResult =
          await executeConfirm(
            payload
          );

        const result =
          normalizeConfirmResult(
            rawResult
          );

        toast.dismiss?.(loadingId);

        if (!result.ok) {
          throw result;
        }

        const successMessage =
          safeText(
            result.message,
            ""
          ) ||
          DEFAULT_SUCCESS_MESSAGE;

        setConfirmSuccessState(
          refs,
          successMessage
        );

        toast.success?.(
          successMessage
        );

        if (
          deps.redirectAfterSuccess !==
          false
        ) {
          isNavigatingAway = true;

          navigateSoon(
            resolveConfirmRedirect(
              result,
              deps
            ),
            Number(
              deps.redirectDelay
            ) ||
              SUCCESS_REDIRECT_DELAY
          );
        }
      } catch (error) {
        const message =
          resolveConfirmErrorMessage(
            error
          );

        toast.dismiss?.(loadingId);

        setGlobalConfirmError(
          refs,
          message
        );

        toast.error?.(message);

        safeErrorLog(
          "[ConfirmResetPasswordView]",
          error
        );

        setConfirmLoading(refs, false, {
          submitLabel,
          loadingLabel,
        });
      } finally {
        if (!isNavigatingAway) {
          isSubmitting = false;

          if (
            refs?.form?.getAttribute(
              "data-success"
            ) !== "true"
          ) {
            setConfirmLoading(
              refs,
              false,
              {
                submitLabel,
                loadingLabel,
              }
            );
          }
        }
      }
    };

    const onClearErrors = () =>
      clearConfirmErrors(refs);

    const onBack = (event) => {
      event.preventDefault();

      if (
        isSubmitting ||
        isNavigatingAway
      ) {
        return;
      }

      navigateTo(
        safeText(
          deps.backHref,
          ""
        ) || "/login"
      );
    };

    const offInputs =
      bindConfirmInputClearers(
        refs,
        onClearErrors
      );

    const offSubmit =
      bindConfirmSubmit(
        refs,
        onSubmit
      );

    const offBack =
      bindConfirmBack(
        refs,
        onBack
      );

    AppCore.cleanup.add(scope, () => {
      offInputs?.();
      offSubmit?.();
      offBack?.();

      clearRedirectTimer();

      if (!isNavigatingAway) {
        toast.dismiss?.();
        setAuthScreen(false);
        restoreGlobalLoaderStyles();
      }
    });

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
    isSubmitting = false;
    isNavigatingAway = false;

    /* reset token */
    stableToken = "";

    destroyViewState();
    setAuthScreen(false);
    restoreGlobalLoaderStyles();
  }

  return {
    init,
    render,
    destroy,
  };
})();

export default ConfirmResetPasswordView;

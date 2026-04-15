/* =========================================================
   Onion SPA - Reset Password View
   Archivo: src/views/password-reset/index.js

   Responsabilidades:
   - orquestar la vista de recuperación de acceso
   - renderizar template auth pro
   - conectar dom, core, toast y flujo reset-password
   - gestionar submit y feedback visual
   - activar / limpiar modo auth-screen del body
   - mantener cleanup de listeners
   - exponer compatibilidad default + named export
   - soportar recuperación con usuario o email
========================================================= */

import { AppCore } from "../../core/index.js";
import Toast from "../../ui/toast/index.js";

import getResetPasswordTemplate from "./reset-password.template.js";

import {
  safeText,
} from "./reset-password.helpers.js";

import {
  getResetPasswordRefs,
  clearResetPasswordErrors,
  setGlobalResetPasswordError,
  setResetPasswordLoading,
  focusResetPasswordPrimaryField,
  readResetPasswordFormState,
  bindResetPasswordInputClearers,
  bindResetPasswordSubmit,
  showResetPasswordToast,
  hideResetPasswordToast,
} from "./reset-password.dom.js";

/* =========================================================
   HELPERS
========================================================= */

function resolveToastApi(deps = {}) {
  const customToast = deps.toast;

  if (
    customToast &&
    typeof customToast === "object"
  ) {
    return customToast;
  }

  return Toast;
}

function resolveResetExecutor(deps = {}) {
  const candidates = [
    deps.onSubmit,
    deps.submitResetPassword,
    deps.resetPasswordRequest,
    deps.requestResetPassword,
    AppCore?.services?.auth?.resetPasswordRequest,
    AppCore?.auth?.resetPasswordRequest,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate;
    }
  }

  return null;
}

function resolveAppName() {
  return (
    safeText(
      AppCore?.config?.appName,
      ""
    ) || "Onion Support"
  );
}

function navigateTo(path = "/login") {
  const finalPath =
    safeText(path, "/login") || "/login";

  if (
    typeof AppCore?.navigate ===
    "function"
  ) {
    AppCore.navigate(finalPath);
    return;
  }

  if (
    typeof AppCore?.router?.navigate ===
    "function"
  ) {
    AppCore.router.navigate(finalPath);
    return;
  }

  window.location.assign(finalPath);
}

function safeToastCall(
  toast,
  method,
  ...args
) {
  try {
    if (
      typeof toast?.[method] ===
      "function"
    ) {
      return toast[method](...args);
    }
  } catch {}

  return null;
}

function emitRouteRendered() {
  try {
    AppCore?.events?.emit?.(
      "app:route:rendered",
      {
        route: "/reset-password",
        view: "reset-password",
      }
    );
  } catch {}
}

function enableAuthScreenMode() {
  try {
    document.body.classList.add(
      "auth-screen"
    );

    document.body.classList.add(
      "login-no-scroll"
    );

    document.body.classList.add(
      "route-auth"
    );
  } catch {}
}

function disableAuthScreenMode() {
  try {
    document.body.classList.remove(
      "auth-screen"
    );

    document.body.classList.remove(
      "login-no-scroll"
    );

    document.body.classList.remove(
      "route-auth"
    );
  } catch {}
}

function normalizeIdentifier(value = "") {
  return safeText(value, "");
}

function validateResetPayload(payload = {}) {
  const errors = {};
  const identifier = normalizeIdentifier(
    payload.identifier
  );

  if (!identifier) {
    errors.identifier =
      "Introduce tu usuario o email.";
  }

  return errors;
}

function getFirstResetError(errors = {}) {
  return (
    errors.identifier ||
    errors.global ||
    "Revisa el formulario."
  );
}

function buildResetPayload(formState = {}) {
  return {
    identifier: normalizeIdentifier(
      formState?.identifier
    ),
  };
}

function resolveResetSuccessMessage(result = {}) {
  return (
    safeText(
      result?.message,
      ""
    ) ||
    "Si el identificador existe, te enviaremos las instrucciones para restablecer el acceso."
  );
}

function resolveResetErrorMessage(error) {
  return (
    safeText(
      error?.message,
      ""
    ) ||
    safeText(
      error?.response?.data?.message,
      ""
    ) ||
    "No se pudo procesar la recuperación de acceso."
  );
}

/* =========================================================
   VIEW
========================================================= */

function renderResetPasswordView(
  container,
  deps = {}
) {
  if (!container) {
    throw new Error(
      "[ResetPasswordView] container es obligatorio."
    );
  }

  enableAuthScreenMode();

  const appName =
    resolveAppName();

  container.innerHTML =
    getResetPasswordTemplate({
      appName,
      ...deps,
    });

  const refs =
    getResetPasswordRefs(container);

  const toast =
    resolveToastApi(deps);

  const executeReset =
    resolveResetExecutor(deps);

  safeToastCall(
    toast,
    "init"
  );

  if (!executeReset) {
    const message =
      "No se encontró un executor de reset-password.";

    setGlobalResetPasswordError(
      refs,
      message
    );

    showResetPasswordToast(
      refs,
      {
        type: "error",
        title: "Error",
        message,
        autoHide: false,
      }
    );

    safeToastCall(
      toast,
      "error",
      message
    );

    emitRouteRendered();

    return {
      destroy() {
        hideResetPasswordToast(
          refs
        );
        disableAuthScreenMode();
      },
    };
  }

  const submitLabel =
    safeText(
      deps.submitLabel,
      ""
    ) ||
    "Enviar enlace";

  const loadingLabel =
    safeText(
      deps.loadingLabel,
      ""
    ) ||
    "Enviando...";

  const successRedirectTo =
    safeText(
      deps.successRedirectTo,
      ""
    ) || "/login";

  const onClearErrors =
    () => {
      clearResetPasswordErrors(
        refs
      );
      hideResetPasswordToast(
        refs
      );
    };

  const onSubmit =
    async (event) => {
      event.preventDefault();

      clearResetPasswordErrors(
        refs
      );
      hideResetPasswordToast(
        refs
      );

      const formState =
        readResetPasswordFormState(
          refs
        );

      const payload =
        buildResetPayload(
          formState
        );

      const errors =
        validateResetPayload(
          payload
        );

      if (
        Object.keys(errors)
          .length > 0
      ) {
        const message =
          getFirstResetError(
            errors
          );

        setGlobalResetPasswordError(
          refs,
          message
        );

        showResetPasswordToast(
          refs,
          {
            type: "error",
            title: "Error",
            message,
            autoHide: false,
          }
        );

        safeToastCall(
          toast,
          "error",
          message
        );

        return;
      }

      let loadingToastId =
        null;

      try {
        setResetPasswordLoading(
          refs,
          true,
          {
            submitLabel,
            loadingLabel,
          }
        );

        showResetPasswordToast(
          refs,
          {
            type: "info",
            title: "Procesando",
            message:
              "Validando identificador y preparando la solicitud...",
            autoHide: false,
          }
        );

        loadingToastId =
          safeToastCall(
            toast,
            "loading",
            "Procesando recuperación de acceso...",
            {
              persist: true,
            }
          );

        const rawResult =
          await executeReset(
            payload
          );

        const message =
          resolveResetSuccessMessage(
            rawResult
          );

        safeToastCall(
          toast,
          "dismiss",
          loadingToastId
        );

        showResetPasswordToast(
          refs,
          {
            type: "success",
            title: "Solicitud enviada",
            message,
            autoHide: true,
          }
        );

        safeToastCall(
          toast,
          "success",
          message
        );

        try {
          AppCore?.events?.emit?.(
            "auth:reset-password:success",
            {
              identifier:
                payload.identifier,
              result: rawResult,
            }
          );
        } catch {}

        const shouldRedirect =
          deps.redirectAfterSuccess ===
          true;

        if (shouldRedirect) {
          window.setTimeout(
            () => {
              disableAuthScreenMode();
              navigateTo(
                successRedirectTo
              );
            },
            900
          );
        }
      } catch (error) {
        safeToastCall(
          toast,
          "dismiss",
          loadingToastId
        );

        const message =
          resolveResetErrorMessage(
            error
          );

        setGlobalResetPasswordError(
          refs,
          message
        );

        showResetPasswordToast(
          refs,
          {
            type: "error",
            title: "Error",
            message,
            autoHide: false,
          }
        );

        safeToastCall(
          toast,
          "error",
          message
        );

        try {
          AppCore?.events?.emit?.(
            "auth:reset-password:error",
            {
              message,
              error,
            }
          );
        } catch {}

        try {
          AppCore?.utils?.error?.(
            "[ResetPasswordView] reset error",
            error
          );
        } catch {}
      } finally {
        setResetPasswordLoading(
          refs,
          false,
          {
            submitLabel,
            loadingLabel,
          }
        );
      }
    };

  const unbindInputs =
    bindResetPasswordInputClearers(
      refs,
      onClearErrors
    );

  const unbindSubmit =
    bindResetPasswordSubmit(
      refs,
      onSubmit
    );

  focusResetPasswordPrimaryField(
    refs
  );

  emitRouteRendered();

  return {
    destroy() {
      unbindInputs();
      unbindSubmit();

      hideResetPasswordToast(
        refs
      );

      disableAuthScreenMode();
    },
  };
}

export {
  renderResetPasswordView as ResetPasswordView,
};

export default renderResetPasswordView;

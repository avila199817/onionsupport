/* =========================================================
   Onion SPA - Reset Password View
   Archivo: src/views/password-reset/resetPasswordView.js

   Responsabilidades:
   - orquestar la vista reset-password
   - renderizar template premium auth
   - conectar dom, helpers, core y toast
   - gestionar submit y feedback visual
   - manejar success / cooldown / error
   - navegar de vuelta a login
   - activar / limpiar modo auth-screen
   - mantener cleanup robusto
   - exponer compatibilidad default + named export
========================================================= */

import { AppCore } from "../../core/index.js";

import getResetPasswordTemplate from "./reset-password.template.js";

import {
  loadRememberedIdentifier,
  createResetPasswordPayload,
  validateResetPasswordPayload,
  getFirstResetPasswordError,
  normalizeResetPasswordResult,
  resolveResetPasswordErrorMessage,
  resolveResetPasswordExecutor,
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
} from "./reset-password.dom.js";

import createResetPasswordToastBridge from "./toast.bridge.js";

/* =========================================================
   HELPERS
========================================================= */

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
    safeText(path, "/login") ||
    "/login";

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
    AppCore.router.navigate(
      finalPath
    );
    return;
  }

  window.location.assign(
    finalPath
  );
}

function emitRendered() {
  try {
    AppCore?.events?.emit?.(
      "app:route:rendered",
      {
        route:
          "/reset-password",
        view:
          "reset-password",
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

/* =========================================================
   VIEW
========================================================= */

function renderResetPasswordView(
  container,
  deps = {}
) {
  if (!container) {
    throw new Error(
      "[ResetPasswordView] container obligatorio."
    );
  }

  enableAuthScreenMode();

  const appName =
    resolveAppName();

  const rememberedIdentifier =
    loadRememberedIdentifier();

  container.innerHTML =
    getResetPasswordTemplate({
      appName,
      rememberedIdentifier,
      ...deps,
    });

  const refs =
    getResetPasswordRefs(
      container
    );

  const toast =
    createResetPasswordToastBridge(
      refs
    );

  toast.init();

  const executeReset =
    resolveResetPasswordExecutor(
      deps
    );

  if (!executeReset) {
    const message =
      "No se encontró handler de recuperación.";

    setGlobalResetPasswordError(
      refs,
      message
    );

    toast.error(
      message
    );

    emitRendered();

    return {
      destroy() {
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

  const onClearErrors =
    () => {
      clearResetPasswordErrors(
        refs
      );

      setResetPasswordNeutralState(
        refs,
        {
          submitLabel,
        }
      );
    };

  const onBack =
    (event) => {
      event.preventDefault();

      navigateTo(
        deps.backToLoginHref ||
          "/login"
      );
    };

  const onSubmit =
    async (event) => {
      event.preventDefault();

      clearResetPasswordErrors(
        refs
      );

      const formState =
        readResetPasswordFormState(
          refs
        );

      const payload =
        createResetPasswordPayload(
          formState
        );

      const errors =
        validateResetPasswordPayload(
          payload
        );

      if (
        Object.keys(errors)
          .length > 0
      ) {
        applyResetPasswordErrors(
          refs,
          errors
        );

        toast.error(
          getFirstResetPasswordError(
            errors
          ) ||
            "Revisa el formulario."
        );

        return;
      }

      persistResetPasswordIdentifier(
        payload.identifier
      );

      let loadingId =
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

        loadingId =
          toast.loading(
            "Procesando solicitud..."
          );

        const raw =
          await executeReset(
            payload
          );

        const result =
          normalizeResetPasswordResult(
            raw
          );

        toast.dismiss(
          loadingId
        );

        if (
          result.cooldown
        ) {
          setResetPasswordLoading(
            refs,
            false,
            {
              submitLabel,
              loadingLabel,
            }
          );

          toast.warning(
            result.message
          );

          return;
        }

        if (!result.ok) {
          throw result;
        }

        setResetPasswordSuccessState(
          refs,
          {
            title:
              "Enviado",
            message:
              buildResetPasswordSuccessMessage(
                result
              ),
          }
        );

        toast.success(
          buildResetPasswordSuccessMessage(
            result
          )
        );

        const redirectDelay =
          Number(
            deps.redirectDelay
          ) || 2200;

        window.setTimeout(
          () => {
            disableAuthScreenMode();

            navigateTo(
              resolveResetPasswordRedirect(
                result,
                deps
              )
            );
          },
          redirectDelay
        );
      } catch (error) {
        toast.dismiss(
          loadingId
        );

        const message =
          resolveResetPasswordErrorMessage(
            error
          );

        setResetPasswordLoading(
          refs,
          false,
          {
            submitLabel,
            loadingLabel,
          }
        );

        setGlobalResetPasswordError(
          refs,
          message
        );

        toast.error(
          message
        );

        try {
          AppCore?.utils?.error?.(
            "[ResetPasswordView]",
            error
          );
        } catch {}
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

  const unbindToast =
    bindResetPasswordToastClose(
      refs,
      () =>
        toast.dismiss()
    );

  const unbindBack =
    bindResetPasswordBackLink(
      refs,
      onBack
    );

  focusResetPasswordPrimaryField(
    refs,
    {
      rememberedIdentifier,
    }
  );

  emitRendered();

  return {
    destroy() {
      unbindInputs();
      unbindSubmit();
      unbindToast();
      unbindBack();

      toast.dismiss();

      disableAuthScreenMode();
    },
  };
}

export {
  renderResetPasswordView as ResetPasswordView,
};

export default renderResetPasswordView;

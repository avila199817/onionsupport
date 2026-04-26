/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   Responsabilidades:
   - orquestar la vista de login
   - renderizar template auth pro
   - conectar dom, auth, core y toast
   - gestionar submit y feedback visual
   - delegar sesión/navegación principal en Auth.login
   - evitar doble navegación post-login
   - evitar doble sync de sesión post-login
   - reducir parpadeos al salir de /login
   - activar / limpiar modo auth-screen del body
   - mantener cleanup de listeners
   - exponer compatibilidad default + named export
   - soportar login con usuario o email
   - conectar password-field compartido para eye / caps lock

   FIX CRÍTICO:
   - Auth.login ya aplica sesión y navega.
   - Esta vista NO debe volver a llamar navigateTo() cuando usa Auth.login.
   - Esta vista NO debe volver a llamar syncSession() cuando usa Auth.login.
   - El auth-screen se limpia en destroy / evento de ruta, no antes de navegar.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import Toast from "../../ui/toast/index.js";

import {
  bindPasswordFieldsInScope,
} from "../../shared/password-field/index.js";

import {
  loadRememberedIdentifier,
  createLoginPayload,
  validateLoginPayload,
  getFirstLoginError,
  normalizeAuthResult,
  resolveAuthErrorMessage,
  persistRememberedIdentifier,
  syncSession,
  resolveLoginRedirect,
  safeText,
} from "./login.helpers.js";

import getLoginTemplate from "./login.template.js";

import {
  getLoginRefs,
  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,
  setLoginLoading,
  focusLoginPrimaryField,
  readLoginFormState,
  bindLoginInputClearers,
  bindThemeToggle,
  bindLoginSubmit,
} from "./login.dom.js";

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function safeObject(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

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

function resolveLoginExecutor(deps = {}) {
  const candidates = [
    deps.onSubmit,
    deps.submitLogin,
    deps.login,
    Auth?.login,
    AppCore?.services?.auth?.login,
    AppCore?.auth?.login,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate;
    }
  }

  return null;
}

function isAuthLoginExecutor(executor) {
  return (
    typeof executor === "function" &&
    typeof Auth?.login === "function" &&
    executor === Auth.login
  );
}

function resolveAppName() {
  return (
    safeText(
      AppCore?.config?.appName,
      ""
    ) || "Onion Support"
  );
}

function resolveForgotPasswordHref(deps = {}) {
  return (
    safeText(
      deps?.forgotPasswordHref,
      ""
    ) || "/reset-password"
  );
}

function navigateTo(path = "/") {
  const finalPath =
    safeText(path, "/") || "/";

  try {
    if (
      typeof AppCore?.Router?.navigate === "function"
    ) {
      AppCore.Router.navigate(
        finalPath,
        {
          replaceState: true,
          force: false,
        }
      );
      return true;
    }
  } catch {}

  try {
    if (
      typeof AppCore?.router?.navigate === "function"
    ) {
      AppCore.router.navigate(
        finalPath,
        {
          replaceState: true,
          force: false,
        }
      );
      return true;
    }
  } catch {}

  try {
    if (
      typeof AppCore?.navigate === "function"
    ) {
      AppCore.navigate(finalPath);
      return true;
    }
  } catch {}

  try {
    if (isBrowser()) {
      window.location.assign(finalPath);
      return true;
    }
  } catch {}

  return false;
}

function toggleTheme() {
  const current =
    document.documentElement.getAttribute("data-theme") || "dark";

  const next =
    current === "light"
      ? "dark"
      : "light";

  document.documentElement.setAttribute(
    "data-theme",
    next
  );

  try {
    AppCore?.setTheme?.(next);
  } catch {}

  try {
    AppCore?.events?.emit?.(
      "app:theme:change",
      next
    );
  } catch {}

  return next;
}

function safeToastCall(toast, method, ...args) {
  try {
    if (
      typeof toast?.[method] === "function"
    ) {
      return toast[method](...args);
    }
  } catch {}

  return null;
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.(
      "[LoginView]",
      ...args
    );
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.(
      "[LoginView]",
      ...args
    );
  } catch {}
}

function safeError(...args) {
  try {
    AppCore?.utils?.error?.(
      "[LoginView]",
      ...args
    );
  } catch {}

  try {
    console.error(
      "[LoginView]",
      ...args
    );
  } catch {}
}

function emitRouteRendered() {
  try {
    AppCore?.events?.emit?.(
      "app:route:rendered",
      {
        route: "/login",
        view: "login",
      }
    );
  } catch {}
}

function enableAuthScreenMode() {
  if (!isBrowser()) {
    return;
  }

  try {
    document.body.classList.add("auth-screen");
    document.body.classList.add("login-no-scroll");
    document.body.classList.add("route-auth");
    document.body.classList.add("route-shell-hidden");
  } catch {}
}

function disableAuthScreenMode() {
  if (!isBrowser()) {
    return;
  }

  try {
    document.body.classList.remove("auth-screen");
    document.body.classList.remove("login-no-scroll");
    document.body.classList.remove("route-auth");
    document.body.classList.remove("route-shell-hidden");
  } catch {}
}

function safeUnbind(unbind) {
  try {
    if (typeof unbind === "function") {
      unbind();
    }
  } catch {}
}

function bindSharedPasswordFields(container = document) {
  try {
    const bindings =
      bindPasswordFieldsInScope(container);

    safeLog(
      "password fields bound:",
      Array.isArray(bindings)
        ? bindings.length
        : 0
    );

    return bindings;
  } catch (error) {
    safeWarn(
      "password-field bind error",
      error
    );

    return [];
  }
}

function onAppEventOnce(eventName, handler) {
  let done = false;

  const wrapped = (...args) => {
    if (done) {
      return;
    }

    done = true;

    try {
      off?.();
    } catch {}

    handler(...args);
  };

  let off = null;

  try {
    if (
      typeof AppCore?.events?.once === "function"
    ) {
      AppCore.events.once(
        eventName,
        wrapped
      );

      off = () => {};
      return off;
    }
  } catch {}

  try {
    if (
      typeof AppCore?.events?.on === "function" &&
      typeof AppCore?.events?.off === "function"
    ) {
      AppCore.events.on(
        eventName,
        wrapped
      );

      off = () => {
        try {
          AppCore.events.off(
            eventName,
            wrapped
          );
        } catch {}
      };

      return off;
    }
  } catch {}

  return () => {};
}

function scheduleAuthScreenCleanupAfterNavigation() {
  if (!isBrowser()) {
    return () => {};
  }

  let cleared = false;
  let timerId = null;

  const cleanup = () => {
    if (cleared) {
      return;
    }

    cleared = true;

    try {
      if (timerId) {
        window.clearTimeout(timerId);
      }
    } catch {}

    disableAuthScreenMode();
  };

  const offRouterRendered =
    onAppEventOnce(
      "router:rendered",
      cleanup
    );

  const offAppRendered =
    onAppEventOnce(
      "app:route:rendered",
      cleanup
    );

  try {
    timerId = window.setTimeout(
      cleanup,
      1200
    );
  } catch {}

  return () => {
    try {
      offRouterRendered?.();
    } catch {}

    try {
      offAppRendered?.();
    } catch {}

    cleanup();
  };
}

function isAuthenticatedResult(auth = {}) {
  return (
    auth?.ok !== false &&
    (
      auth?.status === "authenticated" ||
      auth?.success === true ||
      auth?.token ||
      auth?.user
    )
  );
}

function isTwoFaResult(auth = {}) {
  return (
    auth?.requires2FA === true ||
    auth?.status === "2fa_required"
  );
}

/* =========================================================
   VIEW
========================================================= */

function renderLoginView(container, deps = {}) {
  if (!container) {
    throw new Error(
      "[LoginView] container es obligatorio."
    );
  }

  let mounted = true;
  let isSubmitting = false;
  let isLeavingLogin = false;
  let cleanupAfterNavigation = null;

  enableAuthScreenMode();

  const rememberedIdentifier =
    loadRememberedIdentifier();

  const appName =
    resolveAppName();

  const forgotPasswordHref =
    resolveForgotPasswordHref(deps);

  container.innerHTML =
    getLoginTemplate({
      appName,
      identifier: rememberedIdentifier,
      forgotPasswordHref,
      ...deps,
    });

  /*
    CRÍTICO:
    El template usa src/shared/password-field.
    El binding correcto del ojo/CapsLock debe ser el shared.
    No se usa bindPasswordToggle() de login.dom.js para evitar doble listener.
  */
  bindSharedPasswordFields(container);

  const refs =
    getLoginRefs(container);

  const toast =
    resolveToastApi(deps);

  const executeLogin =
    resolveLoginExecutor(deps);

  const executorIsAuthLogin =
    isAuthLoginExecutor(executeLogin);

  safeToastCall(
    toast,
    "init"
  );

  if (!executeLogin) {
    const message =
      "No se encontró un executor de login.";

    setGlobalLoginError(
      refs,
      message
    );

    safeToastCall(
      toast,
      "error",
      message
    );

    emitRouteRendered();

    return {
      destroy() {
        mounted = false;
        disableAuthScreenMode();
      },
    };
  }

  const submitLabel =
    safeText(
      deps.submitLabel,
      ""
    ) || "Entrar al panel";

  const loadingLabel =
    safeText(
      deps.loadingLabel,
      ""
    ) || "Accediendo...";

  const onClearErrors = () => {
    clearLoginErrors(refs);
  };

  const onThemeToggle = () => {
    const next =
      toggleTheme();

    safeToastCall(
      toast,
      "info",
      `Tema ${next} activado.`
    );
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (
      isSubmitting ||
      isLeavingLogin
    ) {
      return;
    }

    clearLoginErrors(refs);

    const formState =
      readLoginFormState(refs);

    const payload =
      createLoginPayload(formState);

    const errors =
      validateLoginPayload(payload);

    if (
      Object.keys(errors).length > 0
    ) {
      applyLoginErrors(
        refs,
        errors
      );

      safeToastCall(
        toast,
        "error",
        getFirstLoginError(errors) ||
          "Revisa el formulario."
      );

      return;
    }

    persistRememberedIdentifier(
      payload
    );

    let loadingToastId = null;

    try {
      isSubmitting = true;

      setLoginLoading(
        refs,
        true,
        {
          submitLabel,
          loadingLabel,
        }
      );

      loadingToastId =
        safeToastCall(
          toast,
          "loading",
          "Validando credenciales...",
          {
            persist: true,
          }
        );

      /*
        Importante:
        - Si executor es Auth.login, él aplica sesión y navega.
        - Le pasamos navigate=true explícito.
        - La vista NO vuelve a syncSession ni navigateTo.
      */
      const rawResult =
        await executeLogin(
          payload,
          {
            navigate:
              deps.navigate !== false,

            redirectTo:
              deps.redirectTo,

            redirect:
              deps.redirect,

            target:
              deps.target,
          }
        );

      const auth =
        normalizeAuthResult(
          rawResult
        );

      if (!mounted) {
        return;
      }

      safeToastCall(
        toast,
        "dismiss",
        loadingToastId
      );

      if (
        isTwoFaResult(auth)
      ) {
        safeToastCall(
          toast,
          "success",
          auth.message ||
            "Verificación adicional requerida."
        );

        /*
          Auth.login ya navega a /2fa.
          Si el executor es custom, hacemos fallback manual.
        */
        if (!executorIsAuthLogin) {
          const redirectTo =
            resolveLoginRedirect(
              auth,
              deps
            );

          isLeavingLogin = true;
          cleanupAfterNavigation =
            scheduleAuthScreenCleanupAfterNavigation();

          navigateTo(redirectTo);
        } else {
          isLeavingLogin = true;
          cleanupAfterNavigation =
            scheduleAuthScreenCleanupAfterNavigation();
        }

        return;
      }

      if (
        !isAuthenticatedResult(auth)
      ) {
        throw rawResult;
      }

      /*
        Solo para executors custom.
        Auth.login ya hizo applySession().
      */
      if (!executorIsAuthLogin) {
        syncSession(auth);
      }

      safeToastCall(
        toast,
        "success",
        auth.message ||
          "Sesión iniciada correctamente."
      );

      isLeavingLogin = true;

      cleanupAfterNavigation =
        scheduleAuthScreenCleanupAfterNavigation();

      /*
        Solo para executors custom.
        Auth.login ya hizo safeNavigate(redirectTo).
      */
      if (!executorIsAuthLogin) {
        const redirectTo =
          resolveLoginRedirect(
            auth,
            deps
          );

        navigateTo(redirectTo);
      }
    } catch (error) {
      safeToastCall(
        toast,
        "dismiss",
        loadingToastId
      );

      const message =
        resolveAuthErrorMessage(error);

      setGlobalLoginError(
        refs,
        message
      );

      safeToastCall(
        toast,
        "error",
        message
      );

      try {
        AppCore?.events?.emit?.(
          "auth:login:error",
          {
            message,
            error,
          }
        );
      } catch {}

      safeError(
        "login error",
        error
      );
    } finally {
      if (!isLeavingLogin) {
        isSubmitting = false;

        if (mounted) {
          setLoginLoading(
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

  const unbindInputs =
    bindLoginInputClearers(
      refs,
      onClearErrors
    );

  const unbindTheme =
    bindThemeToggle(
      refs,
      onThemeToggle
    );

  const unbindSubmit =
    bindLoginSubmit(
      refs,
      onSubmit
    );

  focusLoginPrimaryField(
    refs,
    {
      rememberedIdentifier,
    }
  );

  emitRouteRendered();

  return {
    destroy() {
      mounted = false;
      isSubmitting = false;
      isLeavingLogin = false;

      safeUnbind(unbindInputs);
      safeUnbind(unbindTheme);
      safeUnbind(unbindSubmit);

      try {
        cleanupAfterNavigation?.();
      } catch {}

      disableAuthScreenMode();
    },
  };
}

export {
  renderLoginView as LoginView,
};

export default renderLoginView;

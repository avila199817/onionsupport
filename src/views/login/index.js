/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   Responsabilidades:
   - orquestar la vista de login
   - renderizar template auth pro
   - conectar dom, auth, core y toast
   - gestionar submit y feedback visual
   - delegar sesión principal en Auth.login
   - evitar doble navegación post-login
   - evitar doble sync de sesión post-login
   - evitar doble submit aunque la vista se monte dos veces
   - evitar doble toast de éxito
   - reducir parpadeos al salir de /login
   - activar / limpiar modo auth-screen del body
   - mantener cleanup de listeners
   - exponer compatibilidad default + named export
   - soportar login con usuario o email
   - conectar password-field compartido para eye / caps lock

   FIX CRÍTICO:
   - Auth.login aplica sesión.
   - Esta vista NO debe volver a llamar syncSession() cuando usa Auth.login.
   - Esta vista SÍ navega si después de Auth.login seguimos en /login.
   - La navegación queda protegida por isStillOnLoginRoute().
   - El auth-screen se limpia al salir realmente de /login.
   - El submit queda protegido a nivel global contra doble binding.
   - El toast success queda deduplicado.
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
   GLOBAL LOGIN SUBMIT FIREBREAK
========================================================= */

let globalLoginSubmitPromise = null;
let lastLoginSuccessToastAt = 0;

const LOGIN_SUCCESS_TOAST_DEDUPE_MS = 1600;

function hasGlobalLoginSubmitInFlight() {
  return Boolean(globalLoginSubmitPromise);
}

function runGlobalLoginSubmit(executor) {
  if (globalLoginSubmitPromise) {
    return globalLoginSubmitPromise;
  }

  const promise =
    Promise.resolve()
      .then(() => executor());

  globalLoginSubmitPromise =
    promise;

  const clear = () => {
    if (globalLoginSubmitPromise === promise) {
      globalLoginSubmitPromise = null;
    }
  };

  promise.then(clear, clear);

  return promise;
}

function setFormSubmittingFlag(refs = {}, value = false) {
  try {
    if (!refs?.form?.dataset) {
      return;
    }

    if (value) {
      refs.form.dataset.loginSubmitting = "1";
      return;
    }

    delete refs.form.dataset.loginSubmitting;
  } catch {}
}

function isFormSubmittingFlagged(refs = {}) {
  try {
    return refs?.form?.dataset?.loginSubmitting === "1";
  } catch {
    return false;
  }
}

function showLoginSuccessToastOnce(toast, message = "") {
  const now =
    Date.now();

  if (
    now - lastLoginSuccessToastAt <
    LOGIN_SUCCESS_TOAST_DEDUPE_MS
  ) {
    return null;
  }

  lastLoginSuccessToastAt =
    now;

  return safeToastCall(
    toast,
    "success",
    message ||
      "Sesión iniciada correctamente."
  );
}

/* =========================================================
   HELPERS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
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

function isAuthLoginExecutor(executor, deps = {}) {
  if (
    deps.delegateNavigationToAuth === false ||
    deps.authLoginOwnsNavigation === false
  ) {
    return false;
  }

  if (
    typeof executor === "function" &&
    typeof Auth?.login === "function" &&
    executor === Auth.login
  ) {
    return true;
  }

  return Boolean(
    !deps.onSubmit &&
      !deps.submitLogin &&
      !deps.login &&
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

function normalizePath(path = "/") {
  const raw =
    safeText(path, "/") || "/";

  try {
    if (
      typeof AppCore?.utils?.normalizePath === "function"
    ) {
      const normalized =
        AppCore.utils.normalizePath(raw);

      if (normalized) {
        return normalized;
      }
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

function stripSearchAndHash(path = "/") {
  return normalizePath(path)
    .split("?")[0]
    .split("#")[0] || "/";
}

function isLoginRoute(path = "") {
  const clean =
    stripSearchAndHash(path);

  return (
    clean === "/login" ||
    clean.startsWith("/login/")
  );
}

function getBrowserPath() {
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

function isStillOnLoginRoute() {
  return isLoginRoute(
    getBrowserPath()
  );
}

function navigateTo(path = "/") {
  const finalPath =
    normalizePath(path || "/");

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
  if (!isBrowser()) {
    return "dark";
  }

  const current =
    document.documentElement.getAttribute("data-theme") ||
    "dark";

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

function cleanupPasswordBindings(bindings = []) {
  if (!Array.isArray(bindings)) {
    return;
  }

  for (const binding of bindings) {
    try {
      if (typeof binding === "function") {
        binding();
        continue;
      }

      if (typeof binding?.destroy === "function") {
        binding.destroy();
        continue;
      }

      if (typeof binding?.unbind === "function") {
        binding.unbind();
        continue;
      }

      if (typeof binding?.off === "function") {
        binding.off();
      }
    } catch {}
  }
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

    return Array.isArray(bindings)
      ? bindings
      : [];
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
  let off = null;

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

  try {
    if (
      typeof AppCore?.events?.once === "function"
    ) {
      AppCore.events.once(
        eventName,
        wrapped
      );

      return () => {};
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

  if (!isStillOnLoginRoute()) {
    cleanup();
    return () => {};
  }

  const offBeforeRender =
    onAppEventOnce(
      "router:before-render",
      cleanup
    );

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
      900
    );
  } catch {}

  return () => {
    try {
      offBeforeRender?.();
    } catch {}

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
      auth?.authenticated === true ||
      auth?.success === true ||
      Boolean(auth?.token) ||
      Boolean(auth?.user)
    )
  );
}

function isTwoFaResult(auth = {}) {
  return (
    auth?.requires2FA === true ||
    auth?.status === "2fa_required" ||
    auth?.status === "mfa_required" ||
    auth?.status === "two_factor_required"
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
  const passwordBindings =
    bindSharedPasswordFields(container);

  const refs =
    getLoginRefs(container);

  const toast =
    resolveToastApi(deps);

  const executeLogin =
    resolveLoginExecutor(deps);

  const executorIsAuthLogin =
    isAuthLoginExecutor(
      executeLogin,
      deps
    );

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

        setFormSubmittingFlag(
          refs,
          false
        );

        cleanupPasswordBindings(
          passwordBindings
        );

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
      isLeavingLogin ||
      hasGlobalLoginSubmitInFlight() ||
      isFormSubmittingFlagged(refs)
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

      setFormSubmittingFlag(
        refs,
        true
      );

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
        Firebreak global:
        aunque el submit esté bindeado dos veces,
        solo una llamada real a Auth.login puede estar activa.
      */
      const rawResult =
        await runGlobalLoginSubmit(() =>
          executeLogin(
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
          )
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

        isLeavingLogin = true;

        cleanupAfterNavigation =
          scheduleAuthScreenCleanupAfterNavigation();

        /*
          Si Auth.login o un executor custom ya navegó, no hacemos nada.
          Si seguimos en /login, navegamos nosotros.
        */
        await Promise.resolve();

        if (isStillOnLoginRoute()) {
          const redirectTo =
            resolveLoginRedirect(
              auth,
              deps
            );

          navigateTo(
            redirectTo || "/2fa"
          );
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
        Auth.login estándar ya hizo applySession().
      */
      if (!executorIsAuthLogin) {
        syncSession(auth);
      }

      showLoginSuccessToastOnce(
        toast,
        auth.message ||
          "Sesión iniciada correctamente."
      );

      isLeavingLogin = true;

      cleanupAfterNavigation =
        scheduleAuthScreenCleanupAfterNavigation();

      /*
        Si Auth.login ya ha navegado internamente, no duplicamos navegación.
        Si después del login seguimos en /login, esta vista resuelve destino.
      */
      await Promise.resolve();

      if (isStillOnLoginRoute()) {
        const redirectTo =
          resolveLoginRedirect(
            auth,
            deps
          );

        navigateTo(
          redirectTo || "/"
        );
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

        setFormSubmittingFlag(
          refs,
          false
        );

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

      setFormSubmittingFlag(
        refs,
        false
      );

      safeUnbind(unbindInputs);
      safeUnbind(unbindTheme);
      safeUnbind(unbindSubmit);

      cleanupPasswordBindings(
        passwordBindings
      );

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

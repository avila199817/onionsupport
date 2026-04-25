/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   Responsabilidades:
   - orquestar la vista de login
   - renderizar template auth pro
   - conectar dom, auth, core y toast
   - gestionar submit y feedback visual
   - sincronizar sesión y redirigir
   - activar / limpiar modo auth-screen del body
   - mantener cleanup de listeners
   - exponer compatibilidad default + named export
   - soportar login con usuario o email
   - conectar password-field compartido para eye / caps lock
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

function resolveToastApi(deps = {}) {
  const customToast = deps.toast;

  if (customToast && typeof customToast === "object") {
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
  const finalPath = safeText(path, "/") || "/";

  try {
    if (typeof AppCore?.navigate === "function") {
      AppCore.navigate(finalPath);
      return;
    }
  } catch {}

  try {
    if (typeof AppCore?.router?.navigate === "function") {
      AppCore.router.navigate(finalPath);
      return;
    }
  } catch {}

  try {
    if (typeof AppCore?.Router?.navigate === "function") {
      AppCore.Router.navigate(finalPath);
      return;
    }
  } catch {}

  try {
    window.location.assign(finalPath);
  } catch {}
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
    if (typeof toast?.[method] === "function") {
      return toast[method](...args);
    }
  } catch {}

  return null;
}

function safeLog(...args) {
  try {
    AppCore?.utils?.log?.("[LoginView]", ...args);
  } catch {}
}

function safeWarn(...args) {
  try {
    AppCore?.utils?.warn?.("[LoginView]", ...args);
  } catch {}
}

function emitRouteRendered() {
  try {
    AppCore?.events?.emit?.("app:route:rendered", {
      route: "/login",
      view: "login",
    });
  } catch {}
}

function enableAuthScreenMode() {
  try {
    document.body.classList.add("auth-screen");
    document.body.classList.add("login-no-scroll");
    document.body.classList.add("route-auth");
  } catch {}
}

function disableAuthScreenMode() {
  try {
    document.body.classList.remove("auth-screen");
    document.body.classList.remove("login-no-scroll");
    document.body.classList.remove("route-auth");
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
    const bindings = bindPasswordFieldsInScope(container);

    safeLog(
      "password fields bound:",
      Array.isArray(bindings) ? bindings.length : 0
    );

    return bindings;
  } catch (error) {
    safeWarn("password-field bind error", error);
    return [];
  }
}

/* =========================================================
   VIEW
========================================================= */

function renderLoginView(container, deps = {}) {
  if (!container) {
    throw new Error("[LoginView] container es obligatorio.");
  }

  enableAuthScreenMode();

  const rememberedIdentifier = loadRememberedIdentifier();
  const appName = resolveAppName();
  const forgotPasswordHref = resolveForgotPasswordHref(deps);

  container.innerHTML = getLoginTemplate({
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

  const refs = getLoginRefs(container);
  const toast = resolveToastApi(deps);
  const executeLogin = resolveLoginExecutor(deps);

  safeToastCall(toast, "init");

  if (!executeLogin) {
    const message = "No se encontró un executor de login.";

    setGlobalLoginError(refs, message);
    safeToastCall(toast, "error", message);
    emitRouteRendered();

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
    const next = toggleTheme();

    safeToastCall(
      toast,
      "info",
      `Tema ${next} activado.`
    );
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    clearLoginErrors(refs);

    const formState = readLoginFormState(refs);
    const payload = createLoginPayload(formState);
    const errors = validateLoginPayload(payload);

    if (Object.keys(errors).length > 0) {
      applyLoginErrors(refs, errors);

      safeToastCall(
        toast,
        "error",
        getFirstLoginError(errors) || "Revisa el formulario."
      );

      return;
    }

    persistRememberedIdentifier(payload);

    let loadingToastId = null;

    try {
      setLoginLoading(refs, true, {
        submitLabel,
        loadingLabel,
      });

      loadingToastId = safeToastCall(
        toast,
        "loading",
        "Validando credenciales...",
        {
          persist: true,
        }
      );

      const rawResult = await executeLogin(payload);
      const auth = normalizeAuthResult(rawResult);

      syncSession(auth);

      safeToastCall(toast, "dismiss", loadingToastId);

      safeToastCall(
        toast,
        "success",
        auth.message || "Sesión iniciada correctamente."
      );

      disableAuthScreenMode();

      const redirectTo = resolveLoginRedirect(auth, deps);

      navigateTo(redirectTo);
    } catch (error) {
      safeToastCall(toast, "dismiss", loadingToastId);

      const message = resolveAuthErrorMessage(error);

      setGlobalLoginError(refs, message);

      safeToastCall(
        toast,
        "error",
        message
      );

      try {
        AppCore?.events?.emit?.("auth:login:error", {
          message,
          error,
        });
      } catch {}

      try {
        AppCore?.utils?.error?.("[LoginView] login error", error);
      } catch {}
    } finally {
      setLoginLoading(refs, false, {
        submitLabel,
        loadingLabel,
      });
    }
  };

  const unbindInputs = bindLoginInputClearers(
    refs,
    onClearErrors
  );

  const unbindTheme = bindThemeToggle(
    refs,
    onThemeToggle
  );

  const unbindSubmit = bindLoginSubmit(
    refs,
    onSubmit
  );

  focusLoginPrimaryField(refs, {
    rememberedIdentifier,
  });

  emitRouteRendered();

  return {
    destroy() {
      safeUnbind(unbindInputs);
      safeUnbind(unbindTheme);
      safeUnbind(unbindSubmit);

      disableAuthScreenMode();
    },
  };
}

export {
  renderLoginView as LoginView,
};

export default renderLoginView;

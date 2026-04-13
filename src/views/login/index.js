/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   Responsabilidades:
   - orquestar la vista de login
   - renderizar template + estilos
   - conectar dom, auth, core y toast
   - gestionar submit y feedback visual
   - sincronizar sesión y redirigir
   - mantener cleanup de listeners
   - exponer compatibilidad default + named export
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import Toast from "../../ui/toast/index.js";

import {
  loadRememberedEmail,
  createLoginPayload,
  validateLoginPayload,
  getFirstLoginError,
  normalizeAuthResult,
  resolveAuthErrorMessage,
  persistRememberedEmail,
  syncSession,
  resolveLoginRedirect,
  safeText,
} from "./login.helpers.js";

import getLoginTemplate from "./login.template.js";
import injectLoginStylesOnce from "./login.styles.js";

import {
  getLoginRefs,
  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,
  setLoginLoading,
  togglePasswordVisibility,
  focusLoginPrimaryField,
  readLoginFormState,
  bindLoginInputClearers,
  bindPasswordToggle,
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
  return safeText(AppCore?.config?.appName, "") || "Onion Support";
}

function resolveForgotPasswordHref(deps = {}) {
  return safeText(deps?.forgotPasswordHref, "") || "/recuperar-acceso";
}

function navigateTo(path = "/") {
  const finalPath = safeText(path, "/") || "/";

  if (typeof AppCore?.navigate === "function") {
    AppCore.navigate(finalPath);
    return;
  }

  window.location.assign(finalPath);
}

function toggleTheme() {
  const current =
    document.documentElement.getAttribute("data-theme") || "dark";

  const next = current === "light" ? "dark" : "light";

  document.documentElement.setAttribute("data-theme", next);

  try {
    AppCore?.setTheme?.(next);
  } catch {
    try {
      AppCore.state = AppCore.state || {};
      AppCore.state.theme = next;
    } catch {}
  }

  try {
    AppCore?.events?.emit?.("app:theme:change", next);
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

function emitRouteRendered() {
  try {
    AppCore?.events?.emit?.("app:route:rendered", {
      route: "/login",
      view: "login",
    });
  } catch {}
}

/* =========================================================
   VIEW
========================================================= */

function renderLoginView(container, deps = {}) {
  if (!container) {
    throw new Error("[LoginView] container es obligatorio.");
  }

  injectLoginStylesOnce();

  const rememberedEmail = loadRememberedEmail();
  const appName = resolveAppName();
  const forgotPasswordHref = resolveForgotPasswordHref(deps);

  container.innerHTML = getLoginTemplate({
    appName,
    email: rememberedEmail,
    forgotPasswordHref,
    ...deps,
  });

  const refs = getLoginRefs(container);
  const toast = resolveToastApi(deps);
  const executeLogin = resolveLoginExecutor(deps);

  safeToastCall(toast, "init");

  if (!executeLogin) {
    const message =
      "No se encontró un executor de login. Revisa src/features/auth/index.js o pasa deps.login.";

    setGlobalLoginError(refs, message);
    safeToastCall(toast, "error", message);

    emitRouteRendered();

    return {
      destroy() {},
    };
  }

  const submitLabel =
    safeText(deps.submitLabel, "") || "Entrar al panel";

  const loadingLabel =
    safeText(deps.loadingLabel, "") || "Accediendo…";

  const onClearErrors = () => {
    clearLoginErrors(refs);
  };

  const onTogglePassword = () => {
    togglePasswordVisibility(refs);
  };

  const onThemeToggle = () => {
    const nextTheme = toggleTheme();
    safeToastCall(toast, "info", `Tema ${nextTheme} activado.`);
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

    persistRememberedEmail(payload);

    let loadingToastId = null;

    try {
      setLoginLoading(refs, true, {
        submitLabel,
        loadingLabel,
      });

      loadingToastId = safeToastCall(
        toast,
        "loading",
        "Validando credenciales…",
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

      const redirectTo = resolveLoginRedirect(auth, deps);
      navigateTo(redirectTo);
    } catch (error) {
      safeToastCall(toast, "dismiss", loadingToastId);

      const message = resolveAuthErrorMessage(error);

      setGlobalLoginError(refs, message);
      safeToastCall(toast, "error", message);

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

  const unbindInputClearers = bindLoginInputClearers(
    refs,
    onClearErrors
  );

  const unbindPasswordToggle = bindPasswordToggle(
    refs,
    onTogglePassword
  );

  const unbindThemeToggle = bindThemeToggle(
    refs,
    onThemeToggle
  );

  const unbindSubmit = bindLoginSubmit(
    refs,
    onSubmit
  );

  focusLoginPrimaryField(refs, {
    rememberedEmail,
  });

  emitRouteRendered();

  return {
    destroy() {
      unbindInputClearers();
      unbindPasswordToggle();
      unbindThemeToggle();
      unbindSubmit();
    },
  };
}

export { renderLoginView as LoginView };
export default renderLoginView;

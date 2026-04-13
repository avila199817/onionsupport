/* =========================================================
   Onion SPA - Login View
   Archivo: src/views/login/index.js

   Responsabilidades:
   - orquestar la vista de login
   - renderizar template + estilos
   - conectar dom, helpers, toast y auth
   - gestionar submit y feedback visual
   - sincronizar sesión y redirigir
   - mantener cleanup de listeners
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import ToastBridge from "../../ui/toast/index.js";

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

function resolveLoginExecutor(deps = {}) {
  const candidates = [
    deps.onSubmit,
    deps.submitLogin,
    deps.login,
    loginRequest,
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
  if (typeof AppCore?.navigate === "function") {
    AppCore.navigate(path);
    return;
  }

  window.location.assign(path);
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

/* =========================================================
   VIEW
========================================================= */

export default function renderLoginView(container, deps = {}) {
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
  const toast = ToastBridge.of(deps.toast);
  const executeLogin = resolveLoginExecutor(deps);

  if (!executeLogin) {
    const message =
      "No se encontró un executor de login. Revisa src/features/auth/index.js o pasa deps.login.";

    setGlobalLoginError(refs, message);

    try {
      toast?.error?.(message);
    } catch {}

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

    try {
      toast?.info?.(`Tema ${nextTheme} activado.`);
    } catch {}
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    clearLoginErrors(refs);

    const formState = readLoginFormState(refs);
    const payload = createLoginPayload(formState);
    const errors = validateLoginPayload(payload);

    if (Object.keys(errors).length > 0) {
      applyLoginErrors(refs, errors);

      try {
        toast?.error?.(
          getFirstLoginError(errors) || "Revisa el formulario."
        );
      } catch {}

      return;
    }

    persistRememberedEmail(payload);

    let loadingToastId = null;

    try {
      setLoginLoading(refs, true, {
        submitLabel,
        loadingLabel,
      });

      try {
        loadingToastId = toast?.loading?.(
          "Validando credenciales…",
          {
            persist: true,
          }
        );
      } catch {}

      const rawResult = await executeLogin(payload);
      const auth = normalizeAuthResult(rawResult);

      syncSession(auth);

      try {
        toast?.dismiss?.(loadingToastId);
      } catch {}

      try {
        toast?.success?.(
          auth.message || "Sesión iniciada correctamente."
        );
      } catch {}

      const redirectTo = resolveLoginRedirect(auth, deps);
      navigateTo(redirectTo);
    } catch (error) {
      try {
        toast?.dismiss?.(loadingToastId);
      } catch {}

      const message = resolveAuthErrorMessage(error);

      setGlobalLoginError(refs, message);

      try {
        toast?.error?.(message);
      } catch {}

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

  try {
    AppCore?.events?.emit?.("app:route:rendered", {
      route: "/login",
      view: "login",
    });
  } catch {}

  return {
    destroy() {
      unbindInputClearers();
      unbindPasswordToggle();
      unbindThemeToggle();
      unbindSubmit();
    },
  };
}

/* =========================================================
   Onion SPA - Reset Password View
   Archivo: src/views/reset-password/index.js

   Responsabilidades:
   - orquestar la vista de recuperación de acceso
   - renderizar template auth pro
   - conectar dom, helpers, core, auth y toast
   - gestionar submit y feedback visual
   - activar / limpiar modo auth-screen del body
   - mantener cleanup de listeners
   - exponer compatibilidad default + named export

   HARDENING:
   - evita reactivar ui al navegar
   - soporta executor desde deps o Auth
   - tolera back link SPA / router / location
   - evita dobles submits
   - mantiene loader global apagado en auth
   - fija ruta pública /reset-password
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";
import Toast from "../../ui/toast/index.js";

import getResetPasswordTemplate from "./reset-password.template.js";

import {
  getResetPasswordRefs,
  clearResetPasswordErrors,
  applyResetPasswordErrors,
  setGlobalResetPasswordError,
  setResetPasswordLoading,
  shakeResetPasswordCard,
  setResetPasswordSuccessState,
  setResetPasswordNeutralState,
  focusResetPasswordPrimaryField,
  readResetPasswordFormState,
  bindResetPasswordInputClearers,
  bindResetPasswordSubmit,
  bindResetPasswordToastClose,
  bindResetPasswordBackLink,
  bindResetPasswordThemeToggle,
  hideResetPasswordToast,
} from "./reset-password.dom.js";

import {
  safeText,
  loadRememberedIdentifier,
  createResetPasswordPayload,
  validateResetPasswordPayload,
  getFirstResetPasswordError,
  normalizeResetPasswordResult,
  resolveResetPasswordErrorMessage,
  resolveResetPasswordExecutor,
  resolveResetPasswordRedirect,
  buildResetPasswordSuccessMessage,
  buildResetPasswordCooldownMessage,
  persistResetPasswordIdentifier,
} from "./reset-password.helpers.js";

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

function safeToastCall(toast, method, ...args) {
  try {
    if (typeof toast?.[method] === "function") {
      return toast[method](...args);
    }
  } catch {}

  return null;
}

function resolveRequestPasswordResetExecutor(deps = {}) {
  return (
    resolveResetPasswordExecutor(deps) ||
    Auth?.requestPasswordReset ||
    Auth?.resetPasswordRequest ||
    Auth?.forgotPassword ||
    null
  );
}

function resolveAppName() {
  return safeText(AppCore?.config?.appName, "") || "Onion Support";
}

function resolveAppVersion() {
  return safeText(AppCore?.config?.version, "") || "1.0.0";
}

function resolveBackToLoginHref(deps = {}) {
  return (
    safeText(deps?.backHref, "") ||
    safeText(deps?.backToLoginHref, "") ||
    "/login"
  );
}

function normalizePath(path = "/") {
  const raw = safeText(path, "/") || "/";

  if (typeof AppCore?.utils?.normalizePath === "function") {
    try {
      return AppCore.utils.normalizePath(raw);
    } catch {}
  }

  if (raw === "/") {
    return "/";
  }

  return raw
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") || "/";
}

function getShellElements() {
  return {
    sidebar: AppCore?.dom?.sidebar || document.getElementById("sidebar"),
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

function enableAuthScreenMode() {
  try {
    const {
      sidebar,
      topbar,
      topbarViewContainer,
      tableheadContainer,
    } = getShellElements();

    document.body.classList.add("auth-screen");
    document.body.classList.add("route-auth");
    document.body.classList.add("route-shell-hidden");
    document.body.classList.add("login-no-scroll");

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    if (sidebar) sidebar.hidden = true;
    if (topbar) topbar.hidden = true;
    if (topbarViewContainer) topbarViewContainer.hidden = true;
    if (tableheadContainer) tableheadContainer.hidden = true;
  } catch {}
}

function disableAuthScreenMode() {
  try {
    const {
      sidebar,
      topbar,
      topbarViewContainer,
      tableheadContainer,
    } = getShellElements();

    document.body.classList.remove("auth-screen");
    document.body.classList.remove("route-auth");
    document.body.classList.remove("route-shell-hidden");
    document.body.classList.remove("login-no-scroll");

    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";

    if (sidebar) sidebar.hidden = false;
    if (topbar) topbar.hidden = false;
    if (topbarViewContainer) topbarViewContainer.hidden = false;
    if (tableheadContainer) tableheadContainer.hidden = false;
  } catch {}
}

function hideGlobalLoader() {
  try {
    AppCore?.setLoading?.(false);
  } catch {}

  try {
    document.body?.classList?.remove?.("loading");
  } catch {}

  const loader =
    AppCore?.dom?.loader ||
    document.getElementById("app-loader");

  if (!loader) return;

  try {
    loader.hidden = true;
    loader.setAttribute("aria-hidden", "true");
    loader.style.display = "none";
    loader.style.opacity = "0";
    loader.style.visibility = "hidden";
    loader.style.pointerEvents = "none";
  } catch {}
}

function navigateTo(path = "/login") {
  const finalPath = normalizePath(path || "/login");

  if (typeof AppCore?.navigate === "function") {
    AppCore.navigate(finalPath);
    return;
  }

  if (typeof AppCore?.router?.navigate === "function") {
    AppCore.router.navigate(finalPath);
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

function emitRouteRendered() {
  try {
    AppCore?.events?.emit?.("app:route:rendered", {
      route: "/reset-password",
      view: "reset-password",
    });
  } catch {}
}

function emitResetPasswordRequested(detail = {}) {
  try {
    AppCore?.events?.emit?.("auth:reset-password:requested", detail);
  } catch {}
}

function emitResetPasswordError(detail = {}) {
  try {
    AppCore?.events?.emit?.("auth:reset-password:error", detail);
  } catch {}
}

function restoreInitialUiState(refs) {
  try {
    hideResetPasswordToast(refs);
  } catch {}

  try {
    setResetPasswordNeutralState(refs);
  } catch {}

  try {
    clearResetPasswordErrors(refs);
  } catch {}
}

/* =========================================================
   VIEW
========================================================= */

function renderResetPasswordView(container, deps = {}) {
  if (!container) {
    throw new Error("[ResetPasswordView] container es obligatorio.");
  }

  enableAuthScreenMode();
  hideGlobalLoader();

  const rememberedIdentifier = loadRememberedIdentifier();
  const appName = resolveAppName();
  const appVersion = resolveAppVersion();
  const backHref = resolveBackToLoginHref(deps);

  container.innerHTML = getResetPasswordTemplate({
    appName,
    appVersion,
    currentYear: new Date().getFullYear(),
    rememberedIdentifier,
    backHref,
    identifierPlaceholder:
      safeText(deps?.identifierPlaceholder, "") || "Usuario o email",
    submitLabel:
      safeText(deps?.submitLabel, "") || "Enviar enlace",
    backLabel:
      safeText(deps?.backLabel, "") || "Volver al acceso",
    subtitle:
      safeText(deps?.subtitle, "") ||
      "Introduce tu usuario o email y te enviaremos las instrucciones para restablecer el acceso.",
    heroEyebrow:
      safeText(deps?.heroEyebrow, "") || "Recuperación segura",
    heroTitle:
      safeText(deps?.heroTitle, "") ||
      "Recupera el acceso sin salir del flujo protegido del panel.",
    bullets:
      Array.isArray(deps?.bullets) && deps.bullets.length
        ? deps.bullets
        : [
            "Verificación del identificador de acceso",
            "Flujo desacoplado del login principal",
            "Recuperación protegida y guiada",
          ],
    ...deps,
  });

  hideGlobalLoader();

  const refs = getResetPasswordRefs(container);
  const toast = resolveToastApi(deps);
  const executeResetPassword = resolveRequestPasswordResetExecutor(deps);

  safeToastCall(toast, "init");
  restoreInitialUiState(refs);

  if (!executeResetPassword) {
    const message =
      "No se encontró un executor para recuperación de acceso. Revisa src/features/auth/index.js o pasa deps.requestResetPassword.";

    setGlobalResetPasswordError(refs, message);
    safeToastCall(toast, "error", message);

    emitRouteRendered();

    return {
      destroy() {
        disableAuthScreenMode();
      },
    };
  }

  const submitLabel =
    safeText(deps.submitLabel, "") || "Enviar enlace";

  const loadingLabel =
    safeText(deps.loadingLabel, "") || "Enviando...";

  let destroyed = false;
  let isSubmitting = false;
  let isNavigatingAway = false;
  let successLocked = false;

  const onClearErrors = () => {
    if (destroyed || isNavigatingAway || successLocked) return;

    clearResetPasswordErrors(refs);
    setResetPasswordNeutralState(refs);
    hideResetPasswordToast(refs);
  };

  const onToastClose = () => {
    if (destroyed || isNavigatingAway) return;
    hideResetPasswordToast(refs);
  };

  const onBackToLogin = (event) => {
    event?.preventDefault?.();

    if (destroyed || isSubmitting) {
      return;
    }

    isNavigatingAway = true;
    disableAuthScreenMode();

    navigateTo(backHref);
  };

  const onThemeToggle = () => {
    if (destroyed || isNavigatingAway || isSubmitting) return;

    const nextTheme = toggleTheme();
    safeToastCall(toast, "info", `Tema ${nextTheme} activado.`);
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (destroyed || isSubmitting || isNavigatingAway || successLocked) {
      return;
    }

    isSubmitting = true;

    clearResetPasswordErrors(refs);
    setResetPasswordNeutralState(refs);

    const formState = readResetPasswordFormState(refs);
    const payload = createResetPasswordPayload(formState);
    const errors = validateResetPasswordPayload(payload);

    if (Object.keys(errors).length > 0) {
      applyResetPasswordErrors(refs, errors);
      shakeResetPasswordCard(refs);

      safeToastCall(
        toast,
        "error",
        getFirstResetPasswordError(errors) ||
          "Revisa el identificador introducido."
      );

      isSubmitting = false;
      return;
    }

    persistResetPasswordIdentifier(payload.identifier);

    let loadingToastId = null;

    try {
      setResetPasswordLoading(refs, true, {
        submitLabel,
        loadingLabel,
      });

      loadingToastId = safeToastCall(
        toast,
        "loading",
        "Comprobando identificador y preparando recuperación...",
        {
          persist: true,
        }
      );

      const rawResult = await executeResetPassword(payload);
      const result = normalizeResetPasswordResult(rawResult);

      safeToastCall(toast, "dismiss", loadingToastId);

      if (!result.ok) {
        const message =
          result.message ||
          "No se pudo iniciar la recuperación de acceso.";

        setGlobalResetPasswordError(refs, message);
        shakeResetPasswordCard(refs);
        safeToastCall(toast, "error", message);

        isSubmitting = false;
        setResetPasswordLoading(refs, false, {
          submitLabel,
          loadingLabel,
        });
        return;
      }

      successLocked = true;
      isSubmitting = false;

      const successMessage = buildResetPasswordSuccessMessage(result);

      setResetPasswordSuccessState(refs, {
        title: "Enlace enviado",
        message: successMessage,
      });

      safeToastCall(toast, "success", successMessage);

      if (result.cooldownSeconds > 0) {
        safeToastCall(
          toast,
          "info",
          buildResetPasswordCooldownMessage(result.cooldownSeconds)
        );
      }

      emitResetPasswordRequested({
        identifier: payload.identifier,
        result,
      });

      const redirectTo = resolveResetPasswordRedirect(result, {
        ...deps,
        backToLoginHref: backHref,
      });

      if (deps.navigateAfterSuccess === true) {
        isNavigatingAway = true;
        disableAuthScreenMode();
        navigateTo(redirectTo);
        return;
      }
    } catch (error) {
      safeToastCall(toast, "dismiss", loadingToastId);

      const message = resolveResetPasswordErrorMessage(error);

      setGlobalResetPasswordError(refs, message);
      shakeResetPasswordCard(refs);

      safeToastCall(toast, "error", message);

      emitResetPasswordError({
        message,
        error,
      });

      try {
        AppCore?.utils?.error?.(
          "[ResetPasswordView] reset password error",
          error
        );
      } catch {}

      isSubmitting = false;

      setResetPasswordLoading(refs, false, {
        submitLabel,
        loadingLabel,
      });

      try {
        refs?.identifierInput?.focus?.();
        refs?.identifierInput?.select?.();
      } catch {}
      return;
    }

    if (!isNavigatingAway) {
      setResetPasswordLoading(refs, false, {
        submitLabel,
        loadingLabel,
      });
    }
  };

  const unbindInputClearers = bindResetPasswordInputClearers(
    refs,
    onClearErrors
  );

  const unbindSubmit = bindResetPasswordSubmit(
    refs,
    onSubmit
  );

  const unbindToastClose = bindResetPasswordToastClose(
    refs,
    onToastClose
  );

  const unbindBackLink = bindResetPasswordBackLink(
    refs,
    onBackToLogin
  );

  const unbindThemeToggle = bindResetPasswordThemeToggle(
    refs,
    onThemeToggle
  );

  focusResetPasswordPrimaryField(refs, {
    rememberedIdentifier,
  });

  emitRouteRendered();

  return {
    destroy() {
      destroyed = true;

      try {
        unbindInputClearers?.();
      } catch {}

      try {
        unbindSubmit?.();
      } catch {}

      try {
        unbindToastClose?.();
      } catch {}

      try {
        unbindBackLink?.();
      } catch {}

      try {
        unbindThemeToggle?.();
      } catch {}

      if (!isNavigatingAway) {
        disableAuthScreenMode();
      }
    },
  };
}

export { renderResetPasswordView as ResetPasswordView };
export default renderResetPasswordView;

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

   HARDENING:
   - soporta login con usuario o correo
   - evita reactivar el form tras login correcto
   - protege redirects inseguros
   - tolera ausencia de theme toggle en template
   - tolera ausencia parcial de api toast
   - mantiene caps lock y password toggle desacoplados
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

function resolveAppVersion() {
  return safeText(AppCore?.config?.version, "") || "1.0.0";
}

function resolveForgotPasswordHref(deps = {}) {
  return safeText(deps?.forgotPasswordHref, "") || "/reset-password";
}

function normalizePath(path = "/") {
  const raw = safeText(path, "/") || "/";

  if (typeof AppCore?.utils?.normalizePath === "function") {
    try {
      return AppCore.utils.normalizePath(raw);
    } catch {}
  }

  if (raw === "/") return "/";

  return raw
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/g, "") || "/";
}

function getRedirectFromLocation() {
  try {
    const url = new URL(window.location.href);
    const redirect = url.searchParams.get("redirect");

    if (!redirect) return "";

    return normalizePath(redirect);
  } catch {
    return "";
  }
}

function isSafeInternalRedirect(path = "") {
  const value = safeText(path, "").trim();

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^\/login(?:[/?#]|$)/i.test(value)) return false;

  return true;
}

function resolveSafeRedirect(path = "", fallback = "/") {
  const normalizedFallback = normalizePath(fallback || "/");
  const normalizedPath = normalizePath(path || "");

  if (!isSafeInternalRedirect(normalizedPath)) {
    return normalizedFallback;
  }

  return normalizedPath;
}

function navigateTo(path = "/") {
  const finalPath = resolveSafeRedirect(path, "/");

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

function syncCapsIndicator(refs = {}) {
  const passwordInput =
    refs?.passwordInput ||
    refs?.password ||
    refs?.container?.querySelector?.("#password") ||
    refs?.container?.querySelector?.("#loginPassword");

  const capsWrap =
    refs?.capsIndicator ||
    refs?.capsWrap ||
    refs?.container?.querySelector?.("#capsIndicator") ||
    refs?.container?.querySelector?.("#loginCapsIndicator");

  const capsIcon =
    refs?.capsIcon ||
    refs?.container?.querySelector?.("#capsIcon");

  const capsLabel =
    refs?.capsLabel ||
    refs?.container?.querySelector?.("#capsLabel");

  if (!passwordInput || !capsWrap) {
    return () => {};
  }

  let passwordFocused = false;
  let capsActive = false;

  const render = () => {
    const visible = Boolean(passwordFocused && capsActive);

    capsWrap.hidden = !visible;
    capsWrap.classList.toggle("is-visible", visible);

    if (capsIcon) {
      capsIcon.hidden = !visible;
    }

    if (capsLabel) {
      capsLabel.hidden = !visible;
    }
  };

  const updateCapsState = (event) => {
    if (!event?.getModifierState) return;
    capsActive = Boolean(event.getModifierState("CapsLock"));
    render();
  };

  const onFocus = (event) => {
    passwordFocused = true;

    if (event?.getModifierState) {
      capsActive = Boolean(event.getModifierState("CapsLock"));
    }

    render();
  };

  const onBlur = () => {
    passwordFocused = false;
    render();
  };

  document.addEventListener("keydown", updateCapsState);
  document.addEventListener("keyup", updateCapsState);
  passwordInput.addEventListener("focus", onFocus);
  passwordInput.addEventListener("blur", onBlur);

  render();

  return () => {
    document.removeEventListener("keydown", updateCapsState);
    document.removeEventListener("keyup", updateCapsState);
    passwordInput.removeEventListener("focus", onFocus);
    passwordInput.removeEventListener("blur", onBlur);
  };
}

function emitLoginError(message, error) {
  try {
    AppCore?.events?.emit?.("auth:login:error", {
      message,
      error,
    });
  } catch {}

  try {
    AppCore?.utils?.error?.("[LoginView] login error", error);
  } catch {}
}

/* =========================================================
   VIEW
========================================================= */

function renderLoginView(container, deps = {}) {
  if (!container) {
    throw new Error("[LoginView] container es obligatorio.");
  }

  enableAuthScreenMode();
  hideGlobalLoader();

  const rememberedIdentifier = loadRememberedEmail();
  const appName = resolveAppName();
  const appVersion = resolveAppVersion();
  const forgotPasswordHref = resolveForgotPasswordHref(deps);
  const redirect = getRedirectFromLocation();

  container.innerHTML = getLoginTemplate({
    appName,
    appVersion,
    currentYear: new Date().getFullYear(),
    redirect,
    email: rememberedIdentifier,
    identifier: rememberedIdentifier,
    forgotPasswordHref,
    identifierPlaceholder:
      safeText(deps?.identifierPlaceholder, "") || "Usuario o email",
    passwordPlaceholder:
      safeText(deps?.passwordPlaceholder, "") || "Contraseña",
    submitLabel:
      safeText(deps?.submitLabel, "") || "Acceder",
    rememberLabel:
      safeText(deps?.rememberLabel, "") || "Recordarme",
    forgotLabel:
      safeText(deps?.forgotLabel, "") || "¿Has olvidado tu contraseña?",
    secureMeta:
      safeText(deps?.secureMeta, "") || "Acceso seguro",
    subtitle:
      safeText(deps?.subtitle, "") ||
      "Accede a tu espacio de soporte, incidencias y gestión interna.",
    heroEyebrow:
      safeText(deps?.heroEyebrow, "") || "Entorno seguro",
    heroTitle:
      safeText(deps?.heroTitle, "") ||
      "Tu acceso entra en un panel más vivo y con más presencia visual.",
    bullets:
      Array.isArray(deps?.bullets) && deps.bullets.length
        ? deps.bullets
        : [
            "Sesión cifrada",
            "Controles de acceso activos",
            "Shell SPA preparado",
          ],
    ...deps,
  });

  hideGlobalLoader();

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
      destroy() {
        disableAuthScreenMode();
      },
    };
  }

  const submitLabel =
    safeText(deps.submitLabel, "") || "Acceder";

  const loadingLabel =
    safeText(deps.loadingLabel, "") || "Accediendo...";

  let destroyed = false;
  let isSubmitting = false;
  let isNavigatingAway = false;

  const onClearErrors = () => {
    if (destroyed || isNavigatingAway) return;
    clearLoginErrors(refs);
  };

  const onTogglePassword = () => {
    if (destroyed || isNavigatingAway) return;
    togglePasswordVisibility(refs);
  };

  const onThemeToggle = () => {
    if (destroyed || isNavigatingAway) return;

    const nextTheme = toggleTheme();
    safeToastCall(toast, "info", `Tema ${nextTheme} activado.`);
  };

  const onSubmit = async (event) => {
    event.preventDefault();

    if (destroyed || isSubmitting || isNavigatingAway) {
      return;
    }

    isSubmitting = true;

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

      isSubmitting = false;
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
        "Validando credenciales...",
        {
          persist: true,
        }
      );

      const rawResult = await executeLogin(payload);
      const auth = normalizeAuthResult(rawResult);

      if (auth?.requires2FA) {
        isNavigatingAway = true;

        safeToastCall(toast, "dismiss", loadingToastId);

        safeToastCall(
          toast,
          "info",
          auth?.message || "Se requiere verificación adicional."
        );

        disableAuthScreenMode();

        const redirectTo = resolveSafeRedirect(
          auth?.redirectTo || "/2fa",
          "/2fa"
        );

        navigateTo(redirectTo);
        return;
      }

      syncSession(auth);

      safeToastCall(toast, "dismiss", loadingToastId);
      safeToastCall(
        toast,
        "success",
        auth?.message || "Sesión iniciada correctamente."
      );

      isNavigatingAway = true;
      disableAuthScreenMode();

      const redirectTo = resolveSafeRedirect(
        resolveLoginRedirect(auth, deps),
        resolveSafeRedirect(redirect, "/")
      );

      navigateTo(redirectTo);
    } catch (error) {
      safeToastCall(toast, "dismiss", loadingToastId);

      const message = resolveAuthErrorMessage(error);

      setGlobalLoginError(refs, message);
      safeToastCall(toast, "error", message);
      emitLoginError(message, error);

      isSubmitting = false;

      try {
        refs?.passwordInput?.focus?.();
        refs?.passwordInput?.select?.();
      } catch {}
    } finally {
      if (!isNavigatingAway) {
        setLoginLoading(refs, false, {
          submitLabel,
          loadingLabel,
        });
      }
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

  const unbindCapsIndicator = syncCapsIndicator(refs);

  focusLoginPrimaryField(refs, {
    rememberedEmail: rememberedIdentifier,
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
        unbindPasswordToggle?.();
      } catch {}

      try {
        unbindThemeToggle?.();
      } catch {}

      try {
        unbindSubmit?.();
      } catch {}

      try {
        unbindCapsIndicator?.();
      } catch {}

      if (!isNavigatingAway) {
        disableAuthScreenMode();
      }
    },
  };
}

export { renderLoginView as LoginView };
export default renderLoginView;

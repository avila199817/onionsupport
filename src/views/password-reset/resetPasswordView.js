/* =========================================================
   Onion Support - Password Reset View
   Archivo: /src/views/password-reset/resetPasswordView.js

   Responsabilidad:
   - Renderizar password-request / password-reset.
   - Delegar DOM en reset-password.dom.js.
   - Validar campos mínimos.
   - Leer token único: token.
   - Llamar Auth.requestPasswordReset() / Auth.confirmResetPassword().
   - Redirigir a /login tras confirmación correcta.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast propio.
   - Sin bridge.
   - Sin loader propio.
   - Sin fallback template.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import { getResetPasswordTemplate } from "./reset-password.template.js";

import {
  getResetPasswordRefs,
  bindResetPasswordFields,
  destroyResetPasswordFields,
  clearResetPasswordErrors,
  applyResetPasswordErrors,
  setGlobalResetPasswordError,
  setResetPasswordLoading,
  setResetPasswordSuccessState,
  readResetPasswordFormState,
  focusResetPasswordPrimaryField,
  bindResetPasswordInputClearers,
  bindResetPasswordSubmit,
  bindResetPasswordBackLink,
} from "./reset-password.dom.js";

export const RESET_PASSWORD_VIEW_VERSION = "password-reset.view.v2";

const SOURCE = "password-reset.view";

const PASSWORD_REQUEST_ROUTE = "/password-request";
const PASSWORD_RESET_ROUTE = "/password-reset";
const LOGIN_ROUTE = "/login";

const TOKEN_PARAM = "token";

const INSTANCES = new WeakMap();

let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFn(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isContainer(value) {
  return Boolean(value && typeof value.querySelector === "function");
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function redact(value = "") {
  return text(value, "")
    .replace(/([?&#]token=)([^&#\s]+)/gi, "$1***")
    .replace(/([?&#]access_token=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   PATHS / TOKEN
========================================================= */

function normalizeHashPath(path = "/") {
  const value = text(path, "/");

  if (value.startsWith("#!")) {
    return value.replace(/^#!\/?/, "/") || "/";
  }

  if (value.startsWith("#/")) {
    return value.slice(1) || "/";
  }

  return value;
}

function normalizePublicPath(path = "/") {
  let value = normalizeHashPath(path);

  if (value.startsWith("//")) return "/";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "/";

  if (!value.startsWith("/")) {
    value = `/${value}`;
  }

  value = value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

  return value || "/";
}

function canonicalPath(path = "/") {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || "/";
  }

  return value || "/";
}

function currentPublicPath() {
  if (!isBrowser()) {
    return normalizePublicPath(
      AppCore?.state?.publicPath ||
        AppCore?.state?.route ||
        "/"
    );
  }

  try {
    return normalizePublicPath(
      `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return "/";
  }
}

function currentPath() {
  return canonicalPath(currentPublicPath());
}

function normalizeToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length > 8192) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

function tokenFromQuery(query = "") {
  const raw = text(query, "");

  if (!raw) return "";

  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
    return normalizeToken(params.get(TOKEN_PARAM));
  } catch {
    return "";
  }
}

function tokenFromPath(path = "") {
  const raw = text(path, "");

  if (!raw) return "";

  const query = raw.includes("?")
    ? raw.split("?").slice(1).join("?").split("#")[0]
    : "";

  const hashQuery = raw.includes("#") && raw.split("#").slice(1).join("#").includes("?")
    ? raw.split("#").slice(1).join("#").split("?").slice(1).join("?")
    : "";

  return tokenFromQuery(query) || tokenFromQuery(hashQuery);
}

function tokenFromUrl() {
  if (!isBrowser()) {
    return tokenFromPath(AppCore?.state?.publicPath || "");
  }

  try {
    return (
      tokenFromQuery(window.location.search) ||
      tokenFromQuery((window.location.hash || "").split("?").slice(1).join("?"))
    );
  } catch {
    return "";
  }
}

function resolveMode(options = {}) {
  const mode = text(options.mode || options.flow, "").toLowerCase();

  if (options.isConfirm === true || mode === "confirm") return "confirm";
  if (mode === "request") return "request";

  return currentPath() === PASSWORD_RESET_ROUTE ? "confirm" : "request";
}

/* =========================================================
   SPA NAVIGATION
========================================================= */

function safeInternalPath(value = "", fallback = LOGIN_ROUTE) {
  const raw = text(value, fallback);

  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;

  return raw.replace(/\/{2,}/g, "/") || fallback;
}

function getRouter() {
  try {
    return (
      AppCore?.Router ||
      AppCore?.router ||
      AppCore?.modules?.get?.("Router") ||
      AppCore?.modules?.get?.("router") ||
      null
    );
  } catch {
    return null;
  }
}

async function navigateTo(path = LOGIN_ROUTE) {
  const target = safeInternalPath(path, LOGIN_ROUTE);
  const router = getRouter();

  try {
    if (isFn(router?.replace)) {
      await router.replace(target, {
        source: SOURCE,
        replaceState: true,
      });

      return true;
    }

    if (isFn(router?.navigate)) {
      await router.navigate(target, {
        source: SOURCE,
        replaceState: true,
      });

      return true;
    }

    if (isFn(AppCore?.navigate)) {
      await AppCore.navigate(target, {
        source: SOURCE,
        replaceState: true,
      });

      return true;
    }
  } catch {
    // fallback navegador abajo
  }

  if (!isBrowser()) return false;

  try {
    window.location.replace(target);
    return true;
  } catch {
    try {
      window.location.assign(target);
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   TEMPLATE
========================================================= */

function getContainer() {
  if (!isBrowser()) return null;

  try {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      document.getElementById("app-content") ||
      document.getElementById("main-content") ||
      null
    );
  } catch {
    return null;
  }
}

function renderTemplate(container, mode = "request", deps = {}) {
  const initialToken = mode === "confirm"
    ? normalizeToken(deps.token || tokenFromUrl())
    : "";

  const template = document.createElement("template");

  template.innerHTML = String(
    getResetPasswordTemplate({
      appName: text(AppCore?.config?.appName, "Onion Support"),
      backHref: LOGIN_ROUTE,
      ...deps,
      mode,
      flow: mode,
      isConfirm: mode === "confirm",
      token: initialToken,
    }) || ""
  );

  container.replaceChildren(template.content.cloneNode(true));

  return true;
}

/* =========================================================
   VALIDATION
========================================================= */

function validateRequest(payload = {}) {
  const errors = {};

  if (!text(payload.identifier, "")) {
    errors.identifier = "Introduce tu usuario o email.";
  }

  return errors;
}

function validateConfirm(payload = {}) {
  const errors = {};

  if (!normalizeToken(payload.token)) {
    errors.global = "El enlace de recuperación no es válido.";
  }

  if (!String(payload.password || "")) {
    errors.password = "Introduce la nueva contraseña.";
  }

  if (!String(payload.confirmPassword || "")) {
    errors.confirmPassword = "Confirma la nueva contraseña.";
  }

  if (
    payload.password &&
    payload.confirmPassword &&
    payload.password !== payload.confirmPassword
  ) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }

  return errors;
}

function resultOk(result = {}) {
  return Boolean(
    result &&
      result.ok !== false &&
      result.success !== false &&
      result.error !== true
  );
}

function resultMessage(result = {}, fallback = "") {
  return text(
    result?.message ||
      result?.mensaje ||
      result?.detail ||
      result?.description,
    fallback
  );
}

function errorMessage(error = null, fallback = "No se pudo completar la operación.") {
  return redact(
    text(
      error?.message ||
        error?.data?.message ||
        error?.response?.data?.message ||
        error?.mensaje ||
        error?.error,
      fallback
    )
  );
}

/* =========================================================
   AUTH ACTIONS
========================================================= */

async function requestReset(payload = {}) {
  if (!isFn(Auth?.requestPasswordReset)) {
    throw new Error("Auth.requestPasswordReset no está disponible.");
  }

  return Auth.requestPasswordReset(
    {
      identifier: payload.identifier,
    },
    {
      source: SOURCE,
    }
  );
}

async function confirmReset(payload = {}) {
  if (!isFn(Auth?.confirmResetPassword)) {
    throw new Error("Auth.confirmResetPassword no está disponible.");
  }

  return Auth.confirmResetPassword(
    {
      token: normalizeToken(payload.token),
      password: payload.password,
      confirmPassword: payload.confirmPassword,
    },
    {
      source: SOURCE,
      skipNavigation: true,
      skipRedirect: true,
      noRedirect: true,
    }
  );
}

/* =========================================================
   INSTANCE
========================================================= */

function destroyPrevious(container) {
  const previous = INSTANCES.get(container);

  if (previous?.destroy) {
    previous.destroy({ remount: true });
    return true;
  }

  return false;
}

function storeInstance(container, instance) {
  INSTANCES.set(container, instance);
  lastInstance = instance;
  return true;
}

function clearInstance(container, instance) {
  if (INSTANCES.get(container) === instance) {
    INSTANCES.delete(container);
  }

  if (lastInstance === instance) {
    lastInstance = null;
  }

  return true;
}

/* =========================================================
   VIEW
========================================================= */

export function renderResetPasswordView(containerArg = null, deps = {}) {
  const container = isContainer(containerArg) ? containerArg : getContainer();

  if (!container) {
    return {
      ok: false,
      missingContainer: true,
    };
  }

  const options = isObject(deps) ? deps : {};
  const mode = resolveMode(options);
  const initialToken = mode === "confirm"
    ? normalizeToken(options.token || tokenFromUrl())
    : "";

  destroyPrevious(container);
  renderTemplate(container, mode, {
    ...options,
    token: initialToken,
  });

  const refs = getResetPasswordRefs(container);

  refs.passwordFieldBindings = bindResetPasswordFields(refs.root || container, {
    force: true,
  });

  let mounted = true;
  let submitting = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setResetPasswordLoading(refs, submitting);
  }

  async function submit(event = null) {
    try {
      event?.preventDefault?.();
    } catch {
      // noop
    }

    if (!mounted || submitting) return false;

    clearResetPasswordErrors(refs);

    const payload = readResetPasswordFormState(refs);

    if (mode === "confirm") {
      payload.token = normalizeToken(payload.token || initialToken || tokenFromUrl());
    }

    const errors = mode === "confirm"
      ? validateConfirm(payload)
      : validateRequest(payload);

    if (Object.keys(errors).length) {
      applyResetPasswordErrors(refs, errors);
      return false;
    }

    setSubmitting(true);

    try {
      const result = mode === "confirm"
        ? await confirmReset(payload)
        : await requestReset(payload);

      if (!resultOk(result)) {
        throw result || new Error("PASSWORD_RESET_FAILED");
      }

      if (mode === "confirm") {
        setResetPasswordSuccessState(refs, {
          message: resultMessage(result, "Contraseña actualizada correctamente."),
        });

        await navigateTo(LOGIN_ROUTE);
        return true;
      }

      setResetPasswordSuccessState(refs, {
        message: resultMessage(
          result,
          "Si el identificador existe, recibirás instrucciones para restablecer la contraseña."
        ),
      });

      return true;
    } catch (error) {
      setGlobalResetPasswordError(
        refs,
        errorMessage(
          error,
          mode === "confirm"
            ? "No se pudo restablecer la contraseña."
            : "No se pudo iniciar la recuperación de acceso."
        )
      );

      return false;
    } finally {
      if (mounted) {
        setSubmitting(false);
      }
    }
  }

  const disposers = [
    bindResetPasswordSubmit(refs, submit),
    bindResetPasswordInputClearers(refs, () => clearResetPasswordErrors(refs)),
    bindResetPasswordBackLink(refs, (event) => {
      try {
        event?.preventDefault?.();
      } catch {
        // noop
      }

      navigateTo(LOGIN_ROUTE);
    }),
    () => destroyResetPasswordFields(refs.root || container),
  ];

  focusResetPasswordPrimaryField(refs);

  const instance = {
    version: RESET_PASSWORD_VIEW_VERSION,
    mode,

    submit,

    unlock() {
      setSubmitting(false);
      return true;
    },

    destroy() {
      mounted = false;
      submitting = false;

      while (disposers.length) {
        try {
          disposers.pop()?.();
        } catch {
          // noop
        }
      }

      try {
        setResetPasswordLoading(refs, false);
      } catch {
        // noop
      }

      clearInstance(container, instance);

      return true;
    },

    getSnapshot() {
      return {
        version: RESET_PASSWORD_VIEW_VERSION,
        mounted,
        submitting,
        mode,
        route: currentPath(),
        hasToken: mode === "confirm" ? Boolean(initialToken || tokenFromUrl()) : false,
        policy: {
          noHttpDirect: true,
          noStore: true,
          noToastOwn: true,
          noLoaderOwn: true,
          tokenParam: TOKEN_PARAM,
          no2fa: true,
        },
      };
    },

    getDebugSnapshot() {
      return this.getSnapshot();
    },
  };

  storeInstance(container, instance);

  return instance;
}

/* =========================================================
   COMPAT API
========================================================= */

function resolveArgs(arg1 = null, arg2 = {}) {
  if (isContainer(arg1)) {
    return {
      container: arg1,
      deps: isObject(arg2) ? arg2 : {},
    };
  }

  return {
    container: getContainer(),
    deps: isObject(arg1) ? arg1 : {},
  };
}

export function init(arg1 = null, arg2 = {}) {
  const { container, deps } = resolveArgs(arg1, arg2);
  return renderResetPasswordView(container, deps);
}

export function render(arg1 = null, arg2 = {}) {
  const { container, deps } = resolveArgs(arg1, arg2);
  return renderResetPasswordView(container, deps);
}

export function mount(arg1 = null, arg2 = {}) {
  return render(arg1, arg2);
}

export function destroy(options = {}) {
  try {
    return Boolean(lastInstance?.destroy?.(options));
  } catch {
    return false;
  }
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  return {
    version: RESET_PASSWORD_VIEW_VERSION,
    mounted: false,
    route: currentPath(),
    mode: resolveMode(),
  };
}

export const getDebugSnapshot = getSnapshot;

export const ResetPasswordView = Object.assign(
  function ResetPasswordViewCompat(container, deps = {}) {
    return renderResetPasswordView(container, deps);
  },
  {
    version: RESET_PASSWORD_VIEW_VERSION,
    render: renderResetPasswordView,
    init,
    mount,
    destroy,
    getSnapshot,
    getDebugSnapshot,
  }
);

export { renderResetPasswordView as renderView };

export default ResetPasswordView;

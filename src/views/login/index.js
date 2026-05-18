/* =========================================================
   Onion Support - Login View
   Archivo: /src/views/login/index.js

   Responsabilidad:
   - Renderizar login.
   - Leer formulario.
   - Validar campos mínimos.
   - Llamar Auth.login().
   - Mostrar error en DOM.
   - Navegar al terminar.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast.
   - Sin 2FA/MFA/OTP.
   - Sin custom executors.
   - Sin eventos globales.
   - Sin loader propio.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import getLoginTemplate from "./login.template.js";

export const LOGIN_VIEW_VERSION = "simple";

const SOURCE = "login.view";
const LOGIN_ROUTE = "/login";
const HOME_ROUTE = "/";
const PASSWORD_REQUEST_ROUTE = "/password-request";

const INSTANCE_KEY = "__ONION_LOGIN_VIEW_INSTANCE__";

let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
}

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function bool(value, fallback = false) {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;

  const clean = text(value, "").toLowerCase();

  if (["true", "yes", "si", "sí", "on"].includes(clean)) return true;
  if (["false", "no", "off"].includes(clean)) return false;

  return Boolean(fallback);
}

function nowIso() {
  return new Date().toISOString();
}

/* =========================================================
   PATHS / NAVIGATION
========================================================= */

function normalizePublicPath(path = HOME_ROUTE) {
  let value = text(path, HOME_ROUTE);

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || HOME_ROUTE;
}

function normalizeCanonicalPath(path = HOME_ROUTE) {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || HOME_ROUTE;

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "") || HOME_ROUTE;
  }

  return value;
}

function currentPath() {
  if (!isBrowser()) {
    return AppCore?.state?.publicPath || AppCore?.state?.route || HOME_ROUTE;
  }

  try {
    const hash = window.location.hash || "";

    if (hash.startsWith("#/") || hash.startsWith("#!")) {
      return normalizePublicPath(hash);
    }

    return normalizePublicPath(
      `${window.location.pathname || HOME_ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return HOME_ROUTE;
  }
}

function isLoginRoute(path = currentPath()) {
  return normalizeCanonicalPath(path) === LOGIN_ROUTE;
}

function isSafeInternalPath(path = "") {
  const value = text(path, "");

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (/[\r\n\t\\]/.test(value)) return false;

  return true;
}

function safeTarget(path = "", fallback = HOME_ROUTE) {
  const candidate = normalizePublicPath(path || fallback);

  if (!isSafeInternalPath(candidate)) return fallback;
  if (normalizeCanonicalPath(candidate) === LOGIN_ROUTE) return fallback;

  return candidate;
}

function homeTarget() {
  return safeTarget(
    AppCore?.config?.routes?.home ||
      AppCore?.config?.auth?.homeRoute ||
      AppCore?.config?.auth?.postLoginFallback ||
      HOME_ROUTE,
    HOME_ROUTE
  );
}

function redirectFromUrl() {
  if (!isBrowser()) return "";

  try {
    const params = new URLSearchParams(window.location.search);
    return safeTarget(params.get("redirect") || "", "");
  } catch {
    return "";
  }
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

async function navigateTo(path = HOME_ROUTE) {
  const target = safeTarget(path, homeTarget());
  const router = getRouter();

  try {
    if (isFunction(router?.replace)) {
      await router.replace(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return true;
    }

    if (isFunction(router?.navigate)) {
      await router.navigate(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return true;
    }
  } catch {
    // fallback abajo
  }

  if (!isBrowser()) return false;

  try {
    window.location.assign(target);
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   DOM
========================================================= */

function query(root, selector = "") {
  if (!root || !selector) return null;

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function setBusy(node, busy = false) {
  if (!node) return false;

  try {
    node.setAttribute("aria-busy", busy ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function setDisabled(node, disabled = false) {
  if (!node) return false;

  try {
    node.disabled = Boolean(disabled);
    node.setAttribute("aria-disabled", disabled ? "true" : "false");
    return true;
  } catch {
    return false;
  }
}

function createMessageNode() {
  if (!isBrowser()) return null;

  const node = document.createElement("div");

  node.className = "login-message";
  node.setAttribute("role", "alert");
  node.setAttribute("aria-live", "polite");
  node.dataset.loginMessage = "true";
  node.hidden = true;

  return node;
}

function getMessageNode(container, form) {
  return (
    query(container, "[data-login-message]") ||
    query(container, "[data-login-error]") ||
    query(container, ".login-message") ||
    (() => {
      const node = createMessageNode();

      try {
        form?.prepend?.(node);
      } catch {
        try {
          container.prepend(node);
        } catch {
          // noop
        }
      }

      return node;
    })()
  );
}

function setMessage(node, message = "", type = "error") {
  if (!node) return false;

  const clean = text(message, "");

  try {
    node.textContent = clean;
    node.hidden = !clean;
    node.dataset.messageType = clean ? type : "";

    node.classList.toggle("is-error", type === "error" && Boolean(clean));
    node.classList.toggle("is-success", type === "success" && Boolean(clean));
    node.classList.toggle("is-info", type === "info" && Boolean(clean));

    return true;
  } catch {
    return false;
  }
}

function getRefs(container) {
  const form =
    query(container, "form[data-login-form]") ||
    query(container, "form") ||
    null;

  return {
    form,

    identifier:
      query(container, "[name='identifier']") ||
      query(container, "[name='email']") ||
      query(container, "[name='username']") ||
      query(container, "[data-login-identifier]") ||
      null,

    password:
      query(container, "[name='password']") ||
      query(container, "[data-login-password]") ||
      null,

    remember:
      query(container, "[name='remember']") ||
      query(container, "[data-login-remember]") ||
      null,

    submit:
      query(container, "button[type='submit']") ||
      query(container, "[data-login-submit]") ||
      null,
  };
}

function renderTemplate(container, deps = {}) {
  const html = getLoginTemplate({
    appName: text(AppCore?.config?.appName, "Onion Support"),
    identifier: "",
    forgotPasswordHref: PASSWORD_REQUEST_ROUTE,
    passwordRequestHref: PASSWORD_REQUEST_ROUTE,
    ...deps,
  });

  try {
    const template = document.createElement("template");
    template.innerHTML = String(html || "");
    container.replaceChildren(template.content.cloneNode(true));
    return true;
  } catch {
    try {
      container.innerHTML = String(html || "");
      return true;
    } catch {
      return false;
    }
  }
}

function focusPrimary(refs) {
  try {
    const target = refs.identifier || refs.password;
    target?.focus?.();
    target?.select?.();
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   FORM
========================================================= */

function readForm(refs) {
  const form = refs.form;

  if (!form) {
    return {
      identifier: "",
      password: "",
      remember: false,
    };
  }

  try {
    const data = new FormData(form);

    return {
      identifier: text(
        data.get("identifier") ||
          data.get("email") ||
          data.get("username") ||
          refs.identifier?.value ||
          "",
        ""
      ),

      password: String(
        data.get("password") ||
          refs.password?.value ||
          ""
      ),

      remember: bool(
        data.get("remember") ||
          refs.remember?.checked ||
          false,
        false
      ),
    };
  } catch {
    return {
      identifier: text(refs.identifier?.value, ""),
      password: String(refs.password?.value || ""),
      remember: Boolean(refs.remember?.checked),
    };
  }
}

function validatePayload(payload = {}) {
  const errors = {};

  if (!text(payload.identifier, "")) {
    errors.identifier = "Introduce tu usuario o email.";
  }

  if (!String(payload.password || "")) {
    errors.password = "Introduce tu contraseña.";
  }

  return errors;
}

function firstError(errors = {}) {
  return Object.values(errors).find(Boolean) || "";
}

function setFieldError(field, message = "") {
  if (!field) return false;

  const clean = text(message, "");

  try {
    field.setAttribute("aria-invalid", clean ? "true" : "false");

    if (clean) {
      field.dataset.error = clean;
    } else {
      delete field.dataset.error;
    }

    return true;
  } catch {
    return false;
  }
}

function clearErrors(refs, messageNode) {
  setMessage(messageNode, "");
  setFieldError(refs.identifier, "");
  setFieldError(refs.password, "");
}

function applyErrors(refs, messageNode, errors = {}) {
  setFieldError(refs.identifier, errors.identifier || "");
  setFieldError(refs.password, errors.password || "");
  setMessage(messageNode, firstError(errors), "error");

  const focusTarget = errors.identifier
    ? refs.identifier
    : errors.password
      ? refs.password
      : null;

  try {
    focusTarget?.focus?.();
  } catch {
    // noop
  }
}

function setLoading(refs, loading = false) {
  const active = Boolean(loading);

  setBusy(refs.form, active);
  setDisabled(refs.identifier, active);
  setDisabled(refs.password, active);
  setDisabled(refs.remember, active);
  setDisabled(refs.submit, active);

  if (!refs.submit) return;

  try {
    if (!refs.submit.dataset.defaultLabel) {
      refs.submit.dataset.defaultLabel = text(refs.submit.textContent, "Entrar");
    }

    refs.submit.textContent = active
      ? "Accediendo..."
      : refs.submit.dataset.defaultLabel;
  } catch {
    // noop
  }
}

/* =========================================================
   AUTH
========================================================= */

function normalizeLoginResult(result = {}) {
  const state = isObject(AppCore?.state) ? AppCore.state : {};

  const authenticated = Boolean(
    result?.authenticated ||
      (state.authenticated && state.hasToken && (state.user || state.currentUser))
  );

  const user =
    result?.user ||
    result?.usuario ||
    result?.me ||
    state.user ||
    state.currentUser ||
    null;

  const role =
    result?.role ||
    user?.role ||
    state.role ||
    null;

  return {
    ok: result?.ok !== false && result?.success !== false && authenticated,
    success: result?.success !== false && authenticated,
    authenticated,

    user,
    role,

    roles:
      Array.isArray(result?.roles)
        ? result.roles
        : role
          ? [role]
          : [],

    redirectTo:
      result?.redirectTo ||
      redirectFromUrl() ||
      homeTarget(),

    message:
      result?.message ||
      "",
  };
}

function errorMessage(error = null) {
  return (
    text(error?.message, "") ||
    text(error?.data?.message, "") ||
    text(error?.response?.data?.message, "") ||
    "No se pudo iniciar sesión."
  );
}

/* =========================================================
   INSTANCE
========================================================= */

function destroyPrevious(container) {
  try {
    const previous = container?.[INSTANCE_KEY];

    if (previous?.destroy) {
      previous.destroy({ remount: true });
      return true;
    }
  } catch {
    // noop
  }

  return false;
}

function storeInstance(container, instance) {
  if (!container || !instance) return false;

  try {
    Object.defineProperty(container, INSTANCE_KEY, {
      value: instance,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch {
    try {
      container[INSTANCE_KEY] = instance;
    } catch {
      // noop
    }
  }

  lastInstance = instance;

  return true;
}

function clearInstance(container, instance) {
  try {
    if (container?.[INSTANCE_KEY] === instance) {
      delete container[INSTANCE_KEY];
    }
  } catch {
    // noop
  }

  if (lastInstance === instance) {
    lastInstance = null;
  }

  return true;
}

/* =========================================================
   VIEW
========================================================= */

export function renderLoginView(container, deps = {}) {
  if (!container) {
    throw new Error("[LoginView] container requerido.");
  }

  destroyPrevious(container);
  renderTemplate(container, deps);

  const refs = getRefs(container);
  const messageNode = getMessageNode(container, refs.form);

  let mounted = true;
  let submitting = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setLoading(refs, submitting);
  }

  async function submit(event = null) {
    try {
      event?.preventDefault?.();
    } catch {
      // noop
    }

    if (!mounted || submitting) return false;

    clearErrors(refs, messageNode);

    const payload = readForm(refs);
    const errors = validatePayload(payload);

    if (Object.keys(errors).length) {
      applyErrors(refs, messageNode, errors);
      return false;
    }

    setSubmitting(true);

    try {
      const raw = await Auth.login(
        {
          identifier: payload.identifier,
          password: payload.password,
          remember: payload.remember,
        },
        {
          source: SOURCE,
          skipNavigation: true,
          skipRedirect: true,
          noRedirect: true,
        }
      );

      const result = normalizeLoginResult(raw);

      if (!result.authenticated) {
        throw new Error(result.message || "Login inválido.");
      }

      setMessage(messageNode, "Sesión iniciada correctamente.", "success");

      if (isLoginRoute()) {
        await navigateTo(result.redirectTo || homeTarget());
      }

      return true;
    } catch (error) {
      setMessage(messageNode, errorMessage(error), "error");
      return false;
    } finally {
      if (mounted) {
        setSubmitting(false);
      }
    }
  }

  const disposers = [];

  try {
    refs.form?.addEventListener?.("submit", submit);
    disposers.push(() => refs.form?.removeEventListener?.("submit", submit));
  } catch {
    // noop
  }

  const clearOnInput = () => clearErrors(refs, messageNode);

  for (const field of [refs.identifier, refs.password]) {
    try {
      field?.addEventListener?.("input", clearOnInput);
      disposers.push(() => field?.removeEventListener?.("input", clearOnInput));
    } catch {
      // noop
    }
  }

  focusPrimary(refs);

  const instance = {
    version: LOGIN_VIEW_VERSION,

    destroy() {
      mounted = false;

      while (disposers.length) {
        try {
          disposers.pop()?.();
        } catch {
          // noop
        }
      }

      clearInstance(container, instance);
      return true;
    },

    unlock() {
      setSubmitting(false);
      return true;
    },

    submit,

    getSnapshot() {
      return {
        version: LOGIN_VIEW_VERSION,
        source: SOURCE,

        mounted,
        submitting,

        currentPath: currentPath(),
        stillOnLogin: isLoginRoute(),

        authenticated: Boolean(AppCore?.state?.authenticated),
        hasUser: Boolean(AppCore?.state?.user || AppCore?.state?.currentUser),
        hasToken: Boolean(AppCore?.state?.hasToken),

        dom: {
          hasForm: Boolean(refs.form),
          hasIdentifier: Boolean(refs.identifier),
          hasPassword: Boolean(refs.password),
          hasSubmit: Boolean(refs.submit),
          hasMessage: Boolean(messageNode),
        },

        at: nowIso(),
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
   COMPAT EXPORTS
========================================================= */

export function init(container, deps = {}) {
  return renderLoginView(container, deps);
}

export function mount(container, deps = {}) {
  return renderLoginView(container, deps);
}

export function destroy(options = {}) {
  if (lastInstance?.destroy) {
    return lastInstance.destroy(options);
  }

  return false;
}

export function getSnapshot() {
  if (lastInstance?.getSnapshot) {
    return lastInstance.getSnapshot();
  }

  return {
    version: LOGIN_VIEW_VERSION,
    source: SOURCE,
    mounted: false,
    currentPath: isBrowser() ? currentPath() : "",
    stillOnLogin: isBrowser() ? isLoginRoute() : false,
    authenticated: Boolean(AppCore?.state?.authenticated),
    hasToken: Boolean(AppCore?.state?.hasToken),
    at: nowIso(),
  };
}

export const LoginView = Object.assign(
  function LoginViewCompat(container, deps = {}) {
    return renderLoginView(container, deps);
  },
  {
    version: LOGIN_VIEW_VERSION,
    render: renderLoginView,
    init,
    mount,
    destroy,
    getSnapshot,
    getDebugSnapshot: getSnapshot,
  }
);

export { renderLoginView as render };

export default LoginView;

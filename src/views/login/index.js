/* =========================================================
   Onion Support - Login View
   Archivo: /src/views/login/index.js

   Responsabilidad:
   - Renderizar login.
   - Delegar DOM en login.dom.js.
   - Validar campos mínimos.
   - Llamar Auth.login().
   - Navegar a /@{user.slug} tras login correcto.
   - Rutas base desde core/config.js.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast directo.
   - Sin 2FA/MFA/OTP.
   - Sin eventos globales.
   - Sin loader propio.
   - Sin navegación browser paralela.
   - Sin AppCore.navigate.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import {
  PUBLIC_ROUTES,
  ROUTES,
} from "../../core/config.js";

import getLoginTemplate from "./login.template.js";

import {
  getLoginRefs,
  bindLoginPasswordFields,
  destroyLoginPasswordFields,
  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,
  setLoginLoading,
  focusLoginPrimaryField,
  readLoginFormState,
  bindLoginInputClearers,
  bindLoginSubmit,
} from "./login.dom.js";

export const LOGIN_VIEW_VERSION = "login.view.v3";

const SOURCE = "login.view";

const HOME_ROUTE = ROUTES.home || ROUTES.root || "/";
const LOGIN_ROUTE = ROUTES.login || "/login";
const PASSWORD_REQUEST_ROUTE = ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET_ROUTE = ROUTES.passwordReset || "/password-reset";
const ACTIVATE_ACCOUNT_ROUTE = ROUTES.activateAccount || "/activate-account";

const PUBLIC_AUTH_ROUTES = new Set(
  Array.isArray(PUBLIC_ROUTES) && PUBLIC_ROUTES.length
    ? [...PUBLIC_ROUTES]
    : [
        LOGIN_ROUTE,
        PASSWORD_REQUEST_ROUTE,
        PASSWORD_RESET_ROUTE,
        ACTIVATE_ACCOUNT_ROUTE,
      ]
);

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

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function redact(value = "") {
  return String(value || "")
    .replace(/([?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=)([^&#\s]+)/gi, "$1***")
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

/* =========================================================
   PATHS
========================================================= */

function cleanPath(value = HOME_ROUTE) {
  let path = text(value, HOME_ROUTE)
    .split("?")[0]
    .split("#")[0];

  if (!path.startsWith("/")) {
    path = `/${path}`;
  }

  path = path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/");

  if (path.length > 1) {
    path = path.replace(/\/+$/g, "") || HOME_ROUTE;
  }

  return path || HOME_ROUTE;
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session)=/i.test(
    String(value || "")
  );
}

function safeInternalPath(value = "", fallback = HOME_ROUTE) {
  const raw = text(value, fallback);

  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;
  if (hasSensitiveQuery(raw)) return fallback;

  const normalized = raw.replace(/\/{2,}/g, "/") || fallback;

  if (cleanPath(normalized) === "/home") return fallback;

  return normalized;
}

function isPublicAuthPath(value = "") {
  return PUBLIC_AUTH_ROUTES.has(cleanPath(value));
}

/* =========================================================
   NAVIGATION
========================================================= */

function getRouter() {
  try {
    return (
      AppCore?.router ||
      AppCore?.Router ||
      AppCore?.modules?.get?.("router") ||
      AppCore?.modules?.get?.("Router") ||
      null
    );
  } catch {
    return null;
  }
}

function authHomeTarget(result = {}) {
  const target = safeInternalPath(
    result?.postLoginTarget ||
      result?.homePath ||
      result?.defaultHome ||
      Auth?.getPostLoginTarget?.() ||
      Auth?.getDefaultHome?.() ||
      AppCore?.state?.postLoginTarget ||
      AppCore?.state?.homePath ||
      AppCore?.state?.defaultHome ||
      HOME_ROUTE,
    HOME_ROUTE
  );

  if (isPublicAuthPath(target)) {
    return HOME_ROUTE;
  }

  return target;
}

async function goAfterLogin(result = {}) {
  const target = authHomeTarget(result);
  const router = getRouter();

  if (!router) return false;

  try {
    if (isFn(router.goAfterLogin)) {
      const output = await router.goAfterLogin(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return output !== false && output?.ok !== false;
    }

    if (isFn(router.replace)) {
      const output = await router.replace(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return output !== false && output?.ok !== false;
    }

    if (isFn(router.navigate)) {
      const output = await router.navigate(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return output !== false && output?.ok !== false;
    }
  } catch {
    return false;
  }

  return false;
}

/* =========================================================
   TEMPLATE
========================================================= */

function renderTemplate(container, deps = {}) {
  const template = document.createElement("template");

  template.innerHTML = String(
    getLoginTemplate({
      ...(isObject(deps) ? deps : {}),

      appName: text(AppCore?.config?.appName, "Onion Support"),

      passwordRequestHref: PASSWORD_REQUEST_ROUTE,
      forgotPasswordHref: PASSWORD_REQUEST_ROUTE,
    }) || ""
  );

  container.replaceChildren(template.content.cloneNode(true));

  return true;
}

/* =========================================================
   VALIDATION
========================================================= */

function validate(payload = {}) {
  const errors = {};

  if (!text(payload.identifier, "")) {
    errors.identifier = "Introduce tu usuario o email.";
  }

  if (!String(payload.password || "")) {
    errors.password = "Introduce tu contraseña.";
  }

  return errors;
}

function authenticated(result = {}) {
  if (result?.authenticated === true) return true;

  try {
    return Auth.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

function errorMessage(error = null) {
  return redact(
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
  const previous = INSTANCES.get(container);

  if (previous?.destroy) {
    previous.destroy({
      remount: true,
    });

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

export function renderLoginView(container, deps = {}) {
  if (!container) {
    throw new Error("[LoginView] container requerido.");
  }

  destroyPrevious(container);
  renderTemplate(container, deps);

  const refs = getLoginRefs(container);

  refs.passwordFieldBindings = bindLoginPasswordFields(refs.root || container, {
    force: true,
  });

  let mounted = true;
  let submitting = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setLoginLoading(refs, submitting);
  }

  async function submit(event = null) {
    try {
      event?.preventDefault?.();
    } catch {
      // noop
    }

    if (!mounted || submitting) return false;

    clearLoginErrors(refs);

    const payload = readLoginFormState(refs);
    const errors = validate(payload);

    if (Object.keys(errors).length) {
      applyLoginErrors(refs, errors);
      return false;
    }

    setSubmitting(true);

    try {
      const result = await Auth.login(
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

      if (!authenticated(result)) {
        throw new Error(result?.message || "Login inválido.");
      }

      const navigated = await goAfterLogin(result);

      if (!navigated) {
        throw new Error("No se pudo completar la navegación tras el login.");
      }

      return true;
    } catch (error) {
      setGlobalLoginError(refs, errorMessage(error));
      return false;
    } finally {
      if (mounted) {
        setSubmitting(false);
      }
    }
  }

  const disposers = [
    bindLoginSubmit(refs, submit),
    bindLoginInputClearers(refs, () => clearLoginErrors(refs)),
    () => destroyLoginPasswordFields(refs.root || container),
  ];

  focusLoginPrimaryField(refs);

  const instance = {
    version: LOGIN_VIEW_VERSION,

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
        setLoginLoading(refs, false);
      } catch {
        // noop
      }

      clearInstance(container, instance);

      return true;
    },

    getSnapshot() {
      const isAuth = authenticated();

      return {
        version: LOGIN_VIEW_VERSION,
        mounted,
        submitting,
        authenticated: isAuth,
        target: isAuth ? redact(authHomeTarget()) : null,
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
    version: LOGIN_VIEW_VERSION,
    mounted: false,
    authenticated: authenticated(),
  };
}

export const getDebugSnapshot = getSnapshot;

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
    getDebugSnapshot,
  }
);

export { renderLoginView as render };

export default LoginView;

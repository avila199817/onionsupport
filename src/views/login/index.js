/* =========================================================
   Onion Support - Login View
   Archivo: /src/views/login/index.js

   Responsabilidad:
   - Renderizar login.
   - Delegar DOM en login.dom.js.
   - Validar campos mínimos.
   - Llamar Auth.login().
   - Navegar a Home tras login correcto.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast directo.
   - Sin 2FA/MFA/OTP.
   - Sin eventos globales.
   - Sin loader propio.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

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

export const LOGIN_VIEW_VERSION = "minimal-2";

const SOURCE = "login.view";
const HOME_ROUTE = "/";
const PASSWORD_REQUEST_ROUTE = "/password-request";

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

function text(value = "", fallback = "") {
  const output = String(value ?? "").trim();
  return output || fallback;
}

function noop() {}

/* =========================================================
   NAVIGATION
========================================================= */

function safeInternalPath(value = "", fallback = HOME_ROUTE) {
  const raw = text(value, fallback);

  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;

  return raw.replace(/\/{2,}/g, "/") || fallback;
}

function homeRoute() {
  return safeInternalPath(
    AppCore?.config?.routes?.home ||
      AppCore?.config?.auth?.homeRoute ||
      HOME_ROUTE,
    HOME_ROUTE
  );
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

async function goHome() {
  const target = homeRoute();
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
  } catch {
    // Fallback abajo.
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
   TEMPLATE
========================================================= */

function renderTemplate(container, deps = {}) {
  const template = document.createElement("template");

  template.innerHTML = String(
    getLoginTemplate({
      appName: text(AppCore?.config?.appName, "Onion Support"),
      passwordRequestHref: PASSWORD_REQUEST_ROUTE,
      forgotPasswordHref: PASSWORD_REQUEST_ROUTE,
      ...deps,
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

      await goHome();
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
      return {
        version: LOGIN_VIEW_VERSION,
        mounted,
        submitting,
        authenticated: Boolean(Auth.isAuthenticated?.()),
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
    authenticated: Boolean(Auth.isAuthenticated?.()),
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

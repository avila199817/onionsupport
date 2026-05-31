/* =========================================================
   Onion Support - Login View Controller
   Archivo: /src/views/public/login/index.js

   Responsabilidad:
   - Controlador mínimo de la vista Login pública.
   - Montar el template recibido desde ./template.js.
   - Leer refs por contrato data-*.
   - Validar formulario mínimo.
   - Llamar Auth.login().
   - Delegar navegación post-login en Router.
   - Gestionar loading/error del formulario.
   - Sin HTML inline.
   - Sin construir campos.
   - Sin logo/card/layout.
   - Sin controlar copys/estructura interna del template.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast directo.
   - Sin storage.
   - Sin eventos globales.
   - Sin navegación browser paralela.
========================================================= */

import { AppCore } from "../../../core/index.js";
import { Auth as DefaultAuth } from "../../../features/auth/index.js";
import createLoginTemplate from "./template.js";

export const LOGIN_VIEW_VERSION = "login.view.public.controller.v3";

const SOURCE = "login.view";

const INSTANCES = new WeakMap();

let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return cleanText(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(
      /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "***"
    );
}

function clearNode(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    try {
      node.textContent = "";
      return true;
    } catch {
      return false;
    }
  }
}

function isDomNode(value = null) {
  return Boolean(
    isBrowser() &&
      value &&
      typeof Node !== "undefined" &&
      value instanceof Node
  );
}

/* =========================================================
   AUTH / ROUTER
========================================================= */

function getAuth(context = {}) {
  return (
    context.Auth ||
    context.auth ||
    AppCore.auth ||
    AppCore.Auth ||
    AppCore.getModule?.("auth") ||
    DefaultAuth ||
    null
  );
}

function getRouter(context = {}) {
  return (
    context.Router ||
    context.router ||
    AppCore.router ||
    AppCore.Router ||
    AppCore.getModule?.("router") ||
    null
  );
}

function resolvePostLoginTarget(result = {}, auth = null) {
  return (
    result?.postLoginTarget ||
    result?.homePath ||
    result?.defaultHome ||
    auth?.getPostLoginTarget?.() ||
    auth?.getDefaultHome?.() ||
    "/"
  );
}

async function goAfterLogin(result = {}, context = {}) {
  const router = getRouter(context);
  const auth = getAuth(context);

  if (!router) {
    throw new Error("Router no disponible.");
  }

  const target = resolvePostLoginTarget(result, auth);

  const options = {
    source: SOURCE,
    replaceState: true,
  };

  if (isFunction(router.goAfterLogin)) {
    return router.goAfterLogin(target, options);
  }

  if (isFunction(router.replace)) {
    return router.replace(target, options);
  }

  if (isFunction(router.navigate)) {
    return router.navigate(target, options);
  }

  throw new Error("Router no permite navegación.");
}

/* =========================================================
   TEMPLATE
========================================================= */

function resolveTemplate() {
  if (!isFunction(createLoginTemplate)) {
    throw new Error("[LoginView] template.js debe exportar createLoginTemplate().");
  }

  const view = createLoginTemplate();

  if (!isDomNode(view)) {
    throw new Error("[LoginView] createLoginTemplate() debe devolver un nodo DOM.");
  }

  return view;
}

function mountTemplate(container) {
  const view = resolveTemplate();

  clearNode(container);
  container.appendChild(view);

  return view;
}

/* =========================================================
   REFS
========================================================= */

function getRefs(root = null) {
  if (!root) {
    throw new Error("[LoginView] root inválido.");
  }

  const refs = {
    root,

    form: root.querySelector("[data-login-form]"),
    identifier: root.querySelector("[data-login-identifier]"),
    password: root.querySelector("[data-login-password]"),
    submit: root.querySelector("[data-login-submit]"),

    globalError: root.querySelector("[data-login-global-error]"),
    identifierError: root.querySelector("[data-login-error='identifier']"),
    passwordError: root.querySelector("[data-login-error='password']"),
  };

  if (!refs.form) {
    throw new Error("[LoginView] falta [data-login-form].");
  }

  if (!refs.identifier) {
    throw new Error("[LoginView] falta [data-login-identifier].");
  }

  if (!refs.password) {
    throw new Error("[LoginView] falta [data-login-password].");
  }

  if (!refs.submit) {
    throw new Error("[LoginView] falta [data-login-submit].");
  }

  return refs;
}

/* =========================================================
   FORM STATE
========================================================= */

function getFieldInput(refs, name = "") {
  if (name === "identifier") return refs.identifier || null;
  if (name === "password") return refs.password || null;

  return null;
}

function getFieldErrorNode(refs, name = "") {
  if (name === "identifier") return refs.identifierError || null;
  if (name === "password") return refs.passwordError || null;

  return null;
}

function setFieldError(refs, name = "", message = "") {
  const input = getFieldInput(refs, name);
  const error = getFieldErrorNode(refs, name);
  const hasError = Boolean(message);

  if (input) {
    input.setAttribute("aria-invalid", hasError ? "true" : "false");
  }

  if (error) {
    error.textContent = message;
    error.hidden = !hasError;
  }

  return hasError;
}

function clearErrors(refs) {
  setFieldError(refs, "identifier", "");
  setFieldError(refs, "password", "");

  if (refs.globalError) {
    refs.globalError.textContent = "";
    refs.globalError.hidden = true;
  }

  return true;
}

function setGlobalError(refs, message = "") {
  if (!refs.globalError) return false;

  refs.globalError.textContent = cleanText(message, "No se pudo iniciar sesión.");
  refs.globalError.hidden = false;

  return true;
}

function setLoading(refs, loading = false) {
  const value = Boolean(loading);
  const busy = value ? "true" : "false";

  for (const node of [refs.identifier, refs.password, refs.submit].filter(Boolean)) {
    node.disabled = value;
  }

  if (refs.submit) {
    refs.submit.dataset.loading = busy;
    refs.submit.setAttribute("aria-busy", busy);
  }

  if (refs.form) {
    refs.form.dataset.loading = busy;
    refs.form.setAttribute("aria-busy", busy);
  }

  return true;
}

function readPayload(refs) {
  return {
    identifier: cleanText(refs.identifier?.value || "", ""),
    password: String(refs.password?.value || ""),
  };
}

function validatePayload(payload = {}) {
  const errors = {};

  if (!cleanText(payload.identifier, "")) {
    errors.identifier = "Introduce tu email o usuario.";
  }

  if (!String(payload.password || "")) {
    errors.password = "Introduce tu contraseña.";
  }

  return errors;
}

function applyErrors(refs, errors = {}) {
  let firstInvalid = null;

  for (const [name, message] of Object.entries(errors)) {
    setFieldError(refs, name, message);

    if (!firstInvalid) {
      firstInvalid = getFieldInput(refs, name);
    }
  }

  try {
    firstInvalid?.focus?.({
      preventScroll: true,
    });
  } catch {
    firstInvalid?.focus?.();
  }

  return Object.keys(errors).length > 0;
}

function authErrorMessage(error = null) {
  const status = Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      0
  );

  const code = cleanText(error?.code || error?.error || "", "").toUpperCase();

  if (
    status === 401 ||
    code.includes("INVALID") ||
    code.includes("UNAUTHORIZED")
  ) {
    return "Credenciales incorrectas.";
  }

  if (
    status === 403 ||
    code.includes("DISABLED") ||
    code.includes("DESACTIVADO") ||
    code.includes("BLOCKED") ||
    code.includes("BLOQUEADO") ||
    code.includes("DELETED") ||
    code.includes("ARCHIVED") ||
    code.includes("SUSPENDED") ||
    code.includes("REVOKED")
  ) {
    return "Tu usuario no tiene acceso activo.";
  }

  if (status >= 500) {
    return "El servidor no respondió correctamente. Inténtalo de nuevo.";
  }

  return cleanText(error?.message || "", "No se pudo iniciar sesión.");
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

export function renderLoginView(container, context = {}) {
  if (!isBrowser()) return null;

  if (!container) {
    throw new Error("[LoginView] container requerido.");
  }

  destroyPrevious(container);

  const auth = getAuth(context);
  const view = mountTemplate(container);
  const refs = getRefs(view);

  let mounted = true;
  let submitting = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setLoading(refs, submitting);
  }

  async function submit(event = null) {
    event?.preventDefault?.();

    if (!mounted || submitting) return false;

    clearErrors(refs);

    const payload = readPayload(refs);
    const errors = validatePayload(payload);

    if (Object.keys(errors).length) {
      applyErrors(refs, errors);
      return false;
    }

    if (!isFunction(auth?.login)) {
      setGlobalError(refs, "Auth no disponible.");
      return false;
    }

    setSubmitting(true);

    try {
      const result = await auth.login(
        {
          identifier: payload.identifier,
          password: payload.password,
        },
        {
          source: SOURCE,
          skipNavigation: true,
          skipRedirect: true,
          noRedirect: true,
        }
      );

      if (!mounted) return false;

      if (result?.authenticated !== true && auth.isAuthenticated?.() !== true) {
        throw new Error("Login inválido.");
      }

      const navigation = await goAfterLogin(result || {}, {
        ...context,
        Auth: auth,
      });

      if (!mounted) return false;

      if (navigation === false || navigation?.ok === false) {
        throw new Error("No se pudo completar la navegación tras el login.");
      }

      return true;
    } catch (error) {
      if (mounted) {
        setGlobalError(refs, authErrorMessage(error));
      }

      return false;
    } finally {
      if (mounted) {
        setSubmitting(false);
      }
    }
  }

  function onInput() {
    if (!submitting) {
      clearErrors(refs);
    }
  }

  refs.form.addEventListener("submit", submit);
  refs.identifier.addEventListener("input", onInput);
  refs.password.addEventListener("input", onInput);

  try {
    refs.identifier.focus({
      preventScroll: true,
    });
  } catch {
    refs.identifier.focus?.();
  }

  const instance = {
    version: LOGIN_VIEW_VERSION,

    root: view,

    submit,

    unlock() {
      setSubmitting(false);
      return true;
    },

    destroy() {
      mounted = false;
      submitting = false;

      try {
        refs.form.removeEventListener("submit", submit);
        refs.identifier.removeEventListener("input", onInput);
        refs.password.removeEventListener("input", onInput);
      } catch {
        // noop
      }

      try {
        setLoading(refs, false);
      } catch {
        // noop
      }

      clearInstance(container, instance);

      return true;
    },

    getSnapshot() {
      const activeAuth = getAuth(context);
      const authenticated = activeAuth?.isAuthenticated?.() === true;

      return {
        version: LOGIN_VIEW_VERSION,
        mounted,
        submitting,
        authenticated,
        target: authenticated
          ? redact(
              activeAuth?.getPostLoginTarget?.() ||
                activeAuth?.getDefaultHome?.() ||
                "/"
            )
          : null,
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
   EXPORTS
========================================================= */

export function init(container, context = {}) {
  return renderLoginView(container, context);
}

export function mount(container, context = {}) {
  return renderLoginView(container, context);
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

  const auth = getAuth();

  return {
    version: LOGIN_VIEW_VERSION,
    mounted: false,
    authenticated: auth?.isAuthenticated?.() === true,
  };
}

export const getDebugSnapshot = getSnapshot;

export const LoginView = Object.assign(
  function LoginViewCompat(container, context = {}) {
    return renderLoginView(container, context);
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

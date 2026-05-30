/* =========================================================
   Onion Support - Login View
   Archivo: /src/views/login/index.js

   Responsabilidad:
   - Renderizar login completo inline.
   - Validar formulario mínimo.
   - Llamar Auth.login().
   - Navegar vía Router tras login correcto.
   - Sin login.template.js, login.dom.js, login.helpers.js,
     password-field, HTTP directo, Store, Toast, storage ni eventos globales.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import {
  ROUTES,
} from "../../core/config.js";

export const LOGIN_VIEW_VERSION = "login.view.minimal.v2";

const SOURCE = "login.view";

const PASSWORD_REQUEST_ROUTE = ROUTES.passwordRequest || "/password-request";
const ACTIVATE_ACCOUNT_ROUTE = ROUTES.activateAccount || "/activate-account";

const INSTANCES = new WeakMap();

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
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   DOM
========================================================= */

function create(tag = "div", options = {}) {
  const node = document.createElement(tag);

  if (options.className) {
    node.className = options.className;
  }

  if (options.textContent) {
    node.textContent = options.textContent;
  }

  for (const [key, value] of Object.entries(options.attrs || {})) {
    if (value === false || value === null || value === undefined) continue;

    node.setAttribute(key, value === true ? "true" : String(value));
  }

  for (const [key, value] of Object.entries(options.dataset || {})) {
    if (value === false || value === null || value === undefined) continue;

    node.dataset[key] = String(value);
  }

  return node;
}

function clear(node = null) {
  if (!node) return false;

  try {
    node.replaceChildren();
    return true;
  } catch {
    node.textContent = "";
    return true;
  }
}

function createField({
  id,
  name,
  label,
  type = "text",
  autocomplete = "",
  placeholder = "",
} = {}) {
  const field = create("div", {
    className: "auth-field login-field",
  });

  const labelNode = create("label", {
    className: "auth-label login-label",
    textContent: label,
    attrs: {
      for: id,
    },
  });

  const input = create("input", {
    className: "auth-input login-input",
    attrs: {
      id,
      name,
      type,
      autocomplete,
      placeholder,
      required: true,
      "aria-describedby": `${id}-error`,
      "data-login-input": name,
    },
  });

  const error = create("p", {
    className: "auth-field-error login-field-error",
    attrs: {
      id: `${id}-error`,
      "data-login-error": name,
      hidden: true,
    },
  });

  field.append(labelNode, input, error);

  return field;
}

function createLoginTemplate() {
  const view = create("section", {
    className: "auth-view login-view",
    attrs: {
      "aria-labelledby": "login-title",
      "data-view": "login",
    },
  });

  const shell = create("div", {
    className: "auth-shell login-shell",
  });

  const card = create("article", {
    className: "auth-card login-card",
  });

  const brand = create("div", {
    className: "auth-brand login-brand",
  });

  const brandMark = create("div", {
    className: "auth-brand-mark login-brand-mark",
    textContent: "ON",
    attrs: {
      "aria-hidden": "true",
    },
  });

  const brandText = create("div", {
    className: "auth-brand-text login-brand-text",
  });

  const appName = create("strong", {
    className: "auth-brand-name login-brand-name",
    textContent: "Onion Support",
  });

  const appClaim = create("span", {
    className: "auth-brand-claim login-brand-claim",
    textContent: "Panel privado",
  });

  brandText.append(appName, appClaim);
  brand.append(brandMark, brandText);

  const title = create("h1", {
    className: "auth-title login-title",
    textContent: "Acceso",
    attrs: {
      id: "login-title",
    },
  });

  const subtitle = create("p", {
    className: "auth-subtitle login-subtitle",
    textContent: "Inicia sesión para entrar en tu panel.",
  });

  const globalError = create("p", {
    className: "auth-error login-global-error",
    attrs: {
      "data-login-global-error": "true",
      role: "alert",
      hidden: true,
    },
  });

  const form = create("form", {
    className: "auth-form login-form",
    attrs: {
      id: "login-form",
      autocomplete: "on",
      novalidate: true,
      "data-login-form": "true",
    },
  });

  form.append(
    createField({
      id: "login-identifier",
      name: "identifier",
      label: "Email o usuario",
      type: "text",
      autocomplete: "username",
      placeholder: "tu@email.com",
    }),
    createField({
      id: "login-password",
      name: "password",
      label: "Contraseña",
      type: "password",
      autocomplete: "current-password",
      placeholder: "••••••••",
    })
  );

  const actions = create("div", {
    className: "auth-actions login-actions",
  });

  const submit = create("button", {
    className: "auth-submit login-submit",
    textContent: "Entrar",
    attrs: {
      type: "submit",
      "data-login-submit": "true",
    },
  });

  actions.appendChild(submit);
  form.appendChild(actions);

  const links = create("nav", {
    className: "auth-links login-links",
    attrs: {
      "aria-label": "Opciones de acceso",
    },
  });

  const forgot = create("a", {
    className: "auth-link login-link",
    textContent: "He olvidado mi contraseña",
    attrs: {
      href: PASSWORD_REQUEST_ROUTE,
      "data-spa": "true",
      "data-route": PASSWORD_REQUEST_ROUTE,
    },
  });

  const activate = create("a", {
    className: "auth-link login-link",
    textContent: "Activar cuenta",
    attrs: {
      href: ACTIVATE_ACCOUNT_ROUTE,
      "data-spa": "true",
      "data-route": ACTIVATE_ACCOUNT_ROUTE,
    },
  });

  links.append(forgot, activate);

  card.append(brand, title, subtitle, globalError, form, links);
  shell.appendChild(card);
  view.appendChild(shell);

  return view;
}

function getRefs(root) {
  return {
    root,
    form: root.querySelector("[data-login-form]"),
    identifier: root.querySelector("[name='identifier']"),
    password: root.querySelector("[name='password']"),
    submit: root.querySelector("[data-login-submit]"),
    globalError: root.querySelector("[data-login-global-error]"),
  };
}

function setFieldError(refs, name = "", message = "") {
  const input = refs.form?.elements?.[name] || null;
  const error = refs.root?.querySelector?.(`[data-login-error="${name}"]`) || null;
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

  for (const input of [refs.identifier, refs.password, refs.submit].filter(Boolean)) {
    input.disabled = value;
  }

  if (refs.submit) {
    refs.submit.textContent = value ? "Accediendo..." : "Entrar";
    refs.submit.dataset.loading = value ? "true" : "false";
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
      firstInvalid = refs.form?.elements?.[name] || null;
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
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  const code = cleanText(error?.code || error?.error || "", "").toUpperCase();

  if (status === 401 || code.includes("INVALID") || code.includes("UNAUTHORIZED")) {
    return "Credenciales incorrectas.";
  }

  if (status === 403 || code.includes("DISABLED") || code.includes("BLOCKED")) {
    return "Tu usuario no tiene acceso activo.";
  }

  if (status >= 500) {
    return "El servidor no respondió correctamente. Inténtalo de nuevo.";
  }

  return cleanText(error?.message || "", "No se pudo iniciar sesión.");
}

/* =========================================================
   ROUTER
========================================================= */

function getRouter(context = {}) {
  return (
    context.Router ||
    AppCore.router ||
    AppCore.Router ||
    AppCore.getModule?.("router") ||
    null
  );
}

async function goAfterLogin(result = {}, context = {}) {
  const router = getRouter(context);

  if (!router) {
    throw new Error("Router no disponible.");
  }

  const target =
    result.postLoginTarget ||
    result.homePath ||
    result.defaultHome ||
    Auth.getPostLoginTarget?.() ||
    Auth.getDefaultHome?.() ||
    "/";

  if (isFunction(router.goAfterLogin)) {
    return router.goAfterLogin(target, {
      source: SOURCE,
      replaceState: true,
      force: true,
    });
  }

  if (isFunction(router.replace)) {
    return router.replace(target, {
      source: SOURCE,
      replaceState: true,
      force: true,
    });
  }

  if (isFunction(router.navigate)) {
    return router.navigate(target, {
      source: SOURCE,
      replaceState: true,
      force: true,
    });
  }

  throw new Error("Router no permite navegación.");
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
  clear(container);

  const view = createLoginTemplate();
  container.appendChild(view);

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

    setSubmitting(true);

    try {
      const result = await Auth.login(
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

      if (result?.authenticated !== true && Auth.isAuthenticated?.() !== true) {
        throw new Error("Login inválido.");
      }

      const navigation = await goAfterLogin(result || {}, context);

      if (navigation === false || navigation?.ok === false) {
        throw new Error("No se pudo completar la navegación tras el login.");
      }

      return true;
    } catch (error) {
      setGlobalError(refs, authErrorMessage(error));
      return false;
    } finally {
      if (mounted) {
        setSubmitting(false);
      }
    }
  }

  function onInput() {
    clearErrors(refs);
  }

  refs.form?.addEventListener("submit", submit);
  refs.identifier?.addEventListener("input", onInput);
  refs.password?.addEventListener("input", onInput);

  try {
    refs.identifier?.focus?.({
      preventScroll: true,
    });
  } catch {
    refs.identifier?.focus?.();
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
        refs.form?.removeEventListener("submit", submit);
        refs.identifier?.removeEventListener("input", onInput);
        refs.password?.removeEventListener("input", onInput);
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
      const authenticated = Auth.isAuthenticated?.() === true;

      return {
        version: LOGIN_VIEW_VERSION,
        mounted,
        submitting,
        authenticated,
        target: authenticated
          ? redact(Auth.getPostLoginTarget?.() || Auth.getDefaultHome?.() || "/")
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

  return {
    version: LOGIN_VIEW_VERSION,
    mounted: false,
    authenticated: Auth.isAuthenticated?.() === true,
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

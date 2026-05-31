/* =========================================================

   Onion Support - Password Reset View Controller
   Archivo: /src/views/public/password-reset/index.js
   
   Responsabilidad:
   - Controlador mínimo de recuperación/restablecimiento de contraseña.
   - Montar el template recibido desde ./template.js.
   - Detectar modo request/reset según ruta y token.
   - Activar controles mínimos de password ya pintados por template.
   - Leer refs por data attributes.
   - Validar formulario mínimo.
   - Llamar Auth.requestPasswordReset() o Auth.confirmResetPassword().
   - Mostrar estado loading/error/success.
   - Navegar vía Router sólo si Auth devuelve sesión autenticada.
   - Sin HTML inline.
   - Sin construir campos.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast directo.
   - Sin storage.
   - Sin eventos globales.
   - Sin navegación browser paralela.
   
========================================================= */

import { AppCore } from "../../../core/index.js";
import { Auth as DefaultAuth } from "../../../features/auth/index.js";

import {
  ROUTES,
  TOKEN_PARAM,
} from "../../../core/config.js";

import createPasswordResetTemplate from "./template.js";

export const PASSWORD_RESET_VIEW_VERSION = "password-reset.view.public.controller.v2";

const SOURCE = "password-reset.view";

const PASSWORD_REQUEST_ROUTE = ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET_ROUTE = ROUTES.passwordReset || "/password-reset";

const MODE_REQUEST = "request";
const MODE_CONFIRM = "confirm";

const MIN_PASSWORD_LENGTH = 8;

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

function setHidden(node = null, hidden = true) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;

    if (value) {
      node.setAttribute("hidden", "");
    } else {
      node.removeAttribute("hidden");
    }

    return true;
  } catch {
    return false;
  }
}

function focusSafe(node = null) {
  if (!node) return false;

  try {
    node.focus({
      preventScroll: true,
    });
  } catch {
    try {
      node.focus?.();
    } catch {
      return false;
    }
  }

  return true;
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

async function goAfterAuthenticated(result = {}, context = {}) {
  const auth = getAuth(context);

  if (result?.authenticated !== true && auth?.isAuthenticated?.() !== true) {
    return false;
  }

  const router = getRouter(context);

  if (!router) return false;

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

  return false;
}

/* =========================================================
   PATH / TOKEN
========================================================= */

function browserPath() {
  if (!isBrowser()) return PASSWORD_REQUEST_ROUTE;

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return PASSWORD_REQUEST_ROUTE;
  }
}

function pathFromContext(context = {}) {
  return cleanText(
    context.publicPath ||
      context.path ||
      context.canonicalPath ||
      context.route?.path ||
      browserPath(),
    PASSWORD_REQUEST_ROUTE
  );
}

function pathnameOnly(value = "") {
  const raw = cleanText(value, PASSWORD_REQUEST_ROUTE);

  try {
    const base = isBrowser() ? window.location.origin : "https://onionsupport.local";
    const url = new URL(raw, base);

    return url.pathname || PASSWORD_REQUEST_ROUTE;
  } catch {
    return raw.split("?")[0].split("#")[0] || PASSWORD_REQUEST_ROUTE;
  }
}

function cleanToken(value = "") {
  const token = cleanText(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length > 8192) return "";

  if (
    [
      "null",
      "undefined",
      "false",
      "true",
      "[object object]",
      "{}",
      "[]",
    ].includes(token.toLowerCase())
  ) {
    return "";
  }

  return token;
}

function tokenFromSearchParams(params = null) {
  if (!params) return "";

  try {
    return cleanToken(
      params.get(TOKEN_PARAM) ||
        params.get("token") ||
        params.get("reset_token") ||
        params.get("resetToken") ||
        ""
    );
  } catch {
    return "";
  }
}

function tokenFromPath(value = "") {
  const raw = cleanText(value, "");

  if (!raw) return "";

  try {
    const base = isBrowser() ? window.location.origin : "https://onionsupport.local";
    const url = new URL(raw, base);
    const fromSearch = tokenFromSearchParams(url.searchParams);

    if (fromSearch) return fromSearch;

    const hash = cleanText(url.hash.replace(/^#/, ""), "");

    if (hash && hash.includes("=")) {
      return tokenFromSearchParams(new URLSearchParams(hash));
    }

    return "";
  } catch {
    return "";
  }
}

function inferMode(context = {}) {
  const path = pathnameOnly(pathFromContext(context));
  const viewKey = cleanText(
    context.viewKey ||
      context.routeViewKey ||
      context.route?.viewKey ||
      context.route?.name ||
      "",
    ""
  ).toLowerCase();

  if (viewKey.includes("password-request")) return MODE_REQUEST;
  if (viewKey.includes("password-reset")) return MODE_CONFIRM;

  if (path === PASSWORD_REQUEST_ROUTE) return MODE_REQUEST;
  if (path === PASSWORD_RESET_ROUTE) return MODE_CONFIRM;

  if (tokenFromPath(pathFromContext(context))) return MODE_CONFIRM;

  return MODE_REQUEST;
}

/* =========================================================
   TEMPLATE
========================================================= */

function resolveTemplate(context = {}) {
  if (!isFunction(createPasswordResetTemplate)) {
    throw new Error("[PasswordResetView] template.js debe exportar createPasswordResetTemplate().");
  }

  const mode = inferMode(context);
  const token = tokenFromPath(pathFromContext(context));

  const view = createPasswordResetTemplate({
    AppCore,
    Auth: getAuth(context),
    context,
    mode,
    tokenPresent: Boolean(token),
  });

  if (!isDomNode(view)) {
    throw new Error("[PasswordResetView] createPasswordResetTemplate() debe devolver un nodo DOM.");
  }

  return {
    view,
    mode,
    token,
  };
}

function mountTemplate(container, context = {}) {
  const resolved = resolveTemplate(context);

  clearNode(container);
  container.appendChild(resolved.view);

  return resolved;
}

/* =========================================================
   REFS
========================================================= */

function getRefs(root = null, mode = MODE_REQUEST) {
  if (!root) {
    throw new Error("[PasswordResetView] root inválido.");
  }

  const refs = {
    root,

    form:
      root.querySelector("[data-password-reset-form]") ||
      root.querySelector("[data-reset-password-form]"),

    message:
      root.querySelector("[data-password-reset-message]") ||
      root.querySelector("[data-reset-password-message]"),

    identifier:
      root.querySelector("[data-password-reset-identifier]") ||
      root.querySelector("[data-reset-password-identifier]") ||
      root.querySelector("[name='identifier']") ||
      root.querySelector("[name='email']") ||
      root.querySelector("[name='username']"),

    password:
      root.querySelector("[data-password-reset-password]") ||
      root.querySelector("[data-reset-password-password]") ||
      root.querySelector("[name='password']"),

    confirmPassword:
      root.querySelector("[data-password-reset-confirm]") ||
      root.querySelector("[data-reset-password-confirm]") ||
      root.querySelector("[name='confirmPassword']") ||
      root.querySelector("[name='confirm_password']"),

    submit:
      root.querySelector("[data-password-reset-submit]") ||
      root.querySelector("[data-reset-password-submit]") ||
      root.querySelector("[type='submit']"),

    tokenError:
      root.querySelector("[data-password-reset-error-for='token']") ||
      root.querySelector("[data-reset-password-error-for='token']"),

    identifierError:
      root.querySelector("[data-password-reset-error-for='identifier']") ||
      root.querySelector("[data-reset-password-error-for='identifier']") ||
      root.querySelector("[data-password-reset-error='identifier']"),

    passwordError:
      root.querySelector("[data-password-reset-error-for='password']") ||
      root.querySelector("[data-reset-password-error-for='password']") ||
      root.querySelector("[data-password-reset-error='password']"),

    confirmPasswordError:
      root.querySelector("[data-password-reset-error-for='confirm-password']") ||
      root.querySelector("[data-reset-password-error-for='confirm-password']") ||
      root.querySelector("[data-password-reset-error='confirm-password']"),

    passwordWrappers: [
      ...root.querySelectorAll("[data-password-wrapper]"),
    ],
  };

  if (!refs.form) {
    throw new Error("[PasswordResetView] falta [data-password-reset-form].");
  }

  if (!refs.submit) {
    throw new Error("[PasswordResetView] falta submit.");
  }

  if (mode === MODE_REQUEST && !refs.identifier) {
    throw new Error("[PasswordResetView] falta input identifier.");
  }

  if (mode === MODE_CONFIRM && !refs.password) {
    throw new Error("[PasswordResetView] falta input password.");
  }

  if (mode === MODE_CONFIRM && !refs.confirmPassword) {
    throw new Error("[PasswordResetView] falta input confirmPassword.");
  }

  return refs;
}

/* =========================================================
   PASSWORD CONTROLS
========================================================= */

function readCapsLock(event = null) {
  try {
    if (!isFunction(event?.getModifierState)) return null;
    return Boolean(event.getModifierState("CapsLock"));
  } catch {
    return null;
  }
}

function getPasswordControlRefs(wrapper = null) {
  if (!wrapper) return null;

  return {
    wrapper,
    input:
      wrapper.querySelector("[data-password-input]") ||
      wrapper.querySelector("input[type='password']") ||
      wrapper.querySelector("input[type='text']") ||
      null,
    toggle:
      wrapper.querySelector("[data-password-toggle]") ||
      wrapper.querySelector("[data-reset-password-toggle]") ||
      null,
    caps:
      wrapper.querySelector("[data-password-caps]") ||
      null,
    eye:
      wrapper.querySelector(".password-eye-icon") ||
      null,
    eyeOff:
      wrapper.querySelector(".password-eye-off-icon") ||
      null,
  };
}

function setPasswordVisible(refs = null, visible = false) {
  if (!refs?.input) return false;

  const value = Boolean(visible);
  const type = value ? "text" : "password";

  try {
    refs.input.type = type;
  } catch {
    refs.input.setAttribute("type", type);
  }

  refs.input.dataset.passwordVisible = value ? "true" : "false";

  if (refs.toggle) {
    refs.toggle.setAttribute("aria-pressed", value ? "true" : "false");
    refs.toggle.setAttribute(
      "aria-label",
      value ? "Ocultar contraseña" : "Mostrar contraseña"
    );
    refs.toggle.dataset.passwordVisible = value ? "true" : "false";
  }

  if (refs.wrapper) {
    refs.wrapper.dataset.passwordVisible = value ? "true" : "false";
  }

  setHidden(refs.eye, value);
  setHidden(refs.eyeOff, !value);

  return true;
}

function setCapsVisible(refs = null, visible = false) {
  if (!refs?.wrapper) return false;

  const value = Boolean(visible);

  if (refs.caps) {
    refs.caps.hidden = !value;

    if (value) {
      refs.caps.removeAttribute("hidden");
    } else {
      refs.caps.setAttribute("hidden", "");
    }
  }

  refs.wrapper.dataset.capsLock = value ? "true" : "false";

  return true;
}

function initSinglePasswordControl(wrapper = null) {
  const refs = getPasswordControlRefs(wrapper);

  if (!refs?.input) {
    return {
      setDisabled() {
        return false;
      },
      destroy() {
        return false;
      },
      getSnapshot() {
        return {
          available: false,
          visible: false,
          capsVisible: false,
        };
      },
    };
  }

  let destroyed = false;
  let visible = false;

  function toggleVisibility(event = null) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (destroyed) return false;
    if (!refs.input || refs.input.disabled) return false;
    if (refs.toggle?.disabled) return false;

    visible = !visible;

    setPasswordVisible(refs, visible);
    focusSafe(refs.input);

    return true;
  }

  function keepPasswordFocus(event = null) {
    event?.preventDefault?.();
  }

  function syncCaps(event = null) {
    if (destroyed) return false;

    const caps = readCapsLock(event);

    if (caps === null) return false;

    setCapsVisible(refs, caps);

    return true;
  }

  function hideCaps() {
    if (destroyed) return false;

    setCapsVisible(refs, false);

    return true;
  }

  refs.toggle?.addEventListener("mousedown", keepPasswordFocus);
  refs.toggle?.addEventListener("click", toggleVisibility);

  refs.input.addEventListener("keydown", syncCaps);
  refs.input.addEventListener("keyup", syncCaps);
  refs.input.addEventListener("keypress", syncCaps);
  refs.input.addEventListener("blur", hideCaps);

  setPasswordVisible(refs, false);
  setCapsVisible(refs, false);

  return {
    setDisabled(disabled = false) {
      if (refs.toggle) {
        refs.toggle.disabled = Boolean(disabled);
      }

      return true;
    },

    destroy() {
      destroyed = true;
      visible = false;

      try {
        refs.toggle?.removeEventListener("mousedown", keepPasswordFocus);
        refs.toggle?.removeEventListener("click", toggleVisibility);

        refs.input?.removeEventListener("keydown", syncCaps);
        refs.input?.removeEventListener("keyup", syncCaps);
        refs.input?.removeEventListener("keypress", syncCaps);
        refs.input?.removeEventListener("blur", hideCaps);
      } catch {
        // noop
      }

      try {
        setPasswordVisible(refs, false);
        setCapsVisible(refs, false);
      } catch {
        // noop
      }

      return true;
    },

    getSnapshot() {
      return {
        available: Boolean(refs.input && refs.toggle),
        visible,
        capsVisible: refs.caps?.hidden === false,
      };
    },
  };
}

function initPasswordControls(refs = {}) {
  const controls = (refs.passwordWrappers || [])
    .map(initSinglePasswordControl)
    .filter(Boolean);

  return {
    setDisabled(disabled = false) {
      for (const control of controls) {
        control.setDisabled?.(disabled);
      }

      return true;
    },

    destroy() {
      for (const control of controls) {
        control.destroy?.();
      }

      return true;
    },

    getSnapshot() {
      return controls.map((control) => control.getSnapshot?.() || null);
    },
  };
}

/* =========================================================
   FORM STATE
========================================================= */

function fieldInput(refs, name = "") {
  if (name === "identifier") return refs.identifier || null;
  if (name === "password") return refs.password || null;
  if (name === "confirm-password") return refs.confirmPassword || null;

  return refs.form?.elements?.[name] || null;
}

function fieldError(refs, name = "") {
  if (name === "token") return refs.tokenError || null;
  if (name === "identifier") return refs.identifierError || null;
  if (name === "password") return refs.passwordError || null;
  if (name === "confirm-password") return refs.confirmPasswordError || null;

  return refs.root?.querySelector?.(`[data-password-reset-error="${name}"]`) || null;
}

function setFieldError(refs, name = "", message = "") {
  const input = fieldInput(refs, name);
  const error = fieldError(refs, name);
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

function setMessage(refs, message = "", type = "info") {
  if (!refs.message) return false;

  const clean = cleanText(message, "");
  const hasMessage = Boolean(clean);

  refs.message.textContent = hasMessage ? clean : "";
  refs.message.hidden = !hasMessage;
  refs.message.dataset.messageType = cleanText(type, "info");
  refs.message.classList.toggle("is-error", type === "error");
  refs.message.classList.toggle("is-success", type === "success");
  refs.message.classList.toggle("is-info", type === "info");

  return true;
}

function clearErrors(refs) {
  setFieldError(refs, "token", "");
  setFieldError(refs, "identifier", "");
  setFieldError(refs, "password", "");
  setFieldError(refs, "confirm-password", "");
  setMessage(refs, "");

  return true;
}

function setLoading(refs, loading = false, passwordControls = null) {
  const value = Boolean(loading);

  for (const node of [
    refs.identifier,
    refs.password,
    refs.confirmPassword,
    refs.submit,
  ].filter(Boolean)) {
    node.disabled = value;
  }

  passwordControls?.setDisabled?.(value);

  if (refs.submit) {
    const loadingText = refs.submit.dataset.loadingText || "Procesando...";
    const currentText = refs.submit.textContent || "Continuar";
    const defaultText = refs.submit.dataset.defaultText || currentText || "Continuar";

    if (!refs.submit.dataset.defaultText) {
      refs.submit.dataset.defaultText = defaultText;
    }

    refs.submit.dataset.loading = value ? "true" : "false";
    refs.submit.setAttribute("aria-busy", value ? "true" : "false");
    refs.submit.textContent = value ? loadingText : defaultText;
  }

  refs.form?.setAttribute("aria-busy", value ? "true" : "false");

  return true;
}

function readPayload(refs, mode = MODE_REQUEST, token = "") {
  if (mode === MODE_CONFIRM) {
    return {
      token,
      password: String(refs.password?.value || ""),
      confirmPassword: String(refs.confirmPassword?.value || ""),
    };
  }

  return {
    identifier: cleanText(refs.identifier?.value || "", ""),
  };
}

function validatePayload(payload = {}, mode = MODE_REQUEST) {
  const errors = {};

  if (mode === MODE_CONFIRM) {
    if (!cleanToken(payload.token)) {
      errors.token = "El enlace no es válido o ha caducado.";
    }

    if (!String(payload.password || "")) {
      errors.password = "Introduce una nueva contraseña.";
    } else if (String(payload.password || "").length < MIN_PASSWORD_LENGTH) {
      errors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }

    if (!String(payload.confirmPassword || "")) {
      errors["confirm-password"] = "Confirma la nueva contraseña.";
    } else if (payload.password !== payload.confirmPassword) {
      errors["confirm-password"] = "Las contraseñas no coinciden.";
    }

    return errors;
  }

  if (!cleanText(payload.identifier, "")) {
    errors.identifier = "Introduce tu usuario o email.";
  }

  return errors;
}

function applyErrors(refs, errors = {}) {
  let firstInvalid = null;

  for (const [name, message] of Object.entries(errors)) {
    setFieldError(refs, name, message);

    if (!firstInvalid) {
      firstInvalid = fieldInput(refs, name);
    }
  }

  focusSafe(firstInvalid);

  return Object.keys(errors).length > 0;
}

function authErrorMessage(error = null, fallback = "No se pudo completar la operación.") {
  const status = Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      0
  );

  const code = cleanText(error?.code || error?.error || "", "").toUpperCase();

  if (status === 400 || code.includes("INVALID")) {
    return "Los datos no son válidos.";
  }

  if (
    status === 401 ||
    code.includes("UNAUTHORIZED") ||
    code.includes("TOKEN") ||
    code.includes("EXPIRED") ||
    code.includes("CADUCADO")
  ) {
    return "El enlace no es válido o ha caducado.";
  }

  if (status === 403) {
    return "No tienes permisos para realizar esta operación.";
  }

  if (status >= 500) {
    return "El servidor no respondió correctamente. Inténtalo de nuevo.";
  }

  return cleanText(error?.message || "", fallback);
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

export function renderPasswordResetView(container, context = {}) {
  if (!isBrowser()) return null;

  if (!container) {
    throw new Error("[PasswordResetView] container requerido.");
  }

  destroyPrevious(container);

  const auth = getAuth(context);
  const mountedTemplate = mountTemplate(container, context);
  const mode = mountedTemplate.mode;
  const token = mountedTemplate.token;
  const refs = getRefs(mountedTemplate.view, mode);
  const passwordControls = initPasswordControls(refs);

  let mounted = true;
  let submitting = false;
  let completed = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setLoading(refs, submitting, passwordControls);
  }

  async function submit(event = null) {
    event?.preventDefault?.();

    if (!mounted || submitting || completed) return false;

    clearErrors(refs);

    const payload = readPayload(refs, mode, token);
    const errors = validatePayload(payload, mode);

    if (Object.keys(errors).length) {
      applyErrors(refs, errors);
      return false;
    }

    if (
      mode === MODE_CONFIRM &&
      !isFunction(auth?.confirmResetPassword)
    ) {
      setMessage(refs, "Auth no permite restablecer contraseña.", "error");
      return false;
    }

    if (
      mode === MODE_REQUEST &&
      !isFunction(auth?.requestPasswordReset)
    ) {
      setMessage(refs, "Auth no permite solicitar recuperación.", "error");
      return false;
    }

    setSubmitting(true);

    try {
      if (mode === MODE_CONFIRM) {
        const result = await auth.confirmResetPassword(
          {
            token: payload.token,
            password: payload.password,
            confirmPassword: payload.confirmPassword,
          },
          {
            source: SOURCE,
          }
        );

        if (!mounted) return false;

        completed = true;

        setMessage(
          refs,
          "Contraseña actualizada. Ya puedes iniciar sesión.",
          "success"
        );

        await goAfterAuthenticated(result || {}, {
          ...context,
          Auth: auth,
        });

        return true;
      }

      await auth.requestPasswordReset(
        {
          identifier: payload.identifier,
        },
        {
          source: SOURCE,
        }
      );

      if (!mounted) return false;

      completed = true;

      setMessage(
        refs,
        "Si el usuario existe, recibirás las instrucciones para recuperar el acceso.",
        "success"
      );

      return true;
    } catch (error) {
      if (mounted) {
        setMessage(refs, authErrorMessage(error), "error");
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

  for (const input of [
    refs.identifier,
    refs.password,
    refs.confirmPassword,
  ].filter(Boolean)) {
    input.addEventListener("input", onInput);
  }

  focusSafe(mode === MODE_CONFIRM ? refs.password : refs.identifier);

  const instance = {
    version: PASSWORD_RESET_VIEW_VERSION,

    root: mountedTemplate.view,
    mode,

    submit,

    unlock() {
      setSubmitting(false);
      completed = false;
      return true;
    },

    destroy() {
      mounted = false;
      submitting = false;

      try {
        refs.form.removeEventListener("submit", submit);

        for (const input of [
          refs.identifier,
          refs.password,
          refs.confirmPassword,
        ].filter(Boolean)) {
          input.removeEventListener("input", onInput);
        }
      } catch {
        // noop
      }

      try {
        setLoading(refs, false, passwordControls);
      } catch {
        // noop
      }

      try {
        passwordControls.destroy();
      } catch {
        // noop
      }

      clearInstance(container, instance);

      return true;
    },

    getSnapshot() {
      const authenticated = auth?.isAuthenticated?.() === true;

      return {
        version: PASSWORD_RESET_VIEW_VERSION,
        mounted,
        submitting,
        completed,
        mode,
        tokenPresent: Boolean(token),
        authenticated,
        passwordControls: passwordControls.getSnapshot(),
        target: authenticated
          ? redact(
              auth?.getPostLoginTarget?.() ||
                auth?.getDefaultHome?.() ||
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
  return renderPasswordResetView(container, context);
}

export function mount(container, context = {}) {
  return renderPasswordResetView(container, context);
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
    version: PASSWORD_RESET_VIEW_VERSION,
    mounted: false,
    authenticated: auth?.isAuthenticated?.() === true,
  };
}

export const getDebugSnapshot = getSnapshot;

export const PasswordResetView = Object.assign(
  function PasswordResetViewCompat(container, context = {}) {
    return renderPasswordResetView(container, context);
  },
  {
    version: PASSWORD_RESET_VIEW_VERSION,
    render: renderPasswordResetView,
    init,
    mount,
    destroy,
    getSnapshot,
    getDebugSnapshot,
  }
);

export const PasswordRequestView = PasswordResetView;
export const ResetPasswordView = PasswordResetView;

export { renderPasswordResetView as render };

export default PasswordResetView;


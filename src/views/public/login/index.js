/* =========================================================
   Onion Support - Login View Controller
   Archivo: /src/views/public/login/index.js

   Responsabilidad:
   - Controlador mínimo y robusto del login público.
   - Montar el DOM recibido desde ./template.js.
   - Mantener intacto el contrato real de Auth.login().
   - Gestionar password visible, Caps Lock, loading y errores.
   - Delegar la navegación post-login exclusivamente al Router.
   - Sin HTTP directo.
   - Sin Store.
   - Sin storage.
   - Sin HTML de layout inline.
========================================================= */

import { AppCore } from "../../../core/index.js";
import { Auth as DefaultAuth } from "../../../features/auth/index.js";
import createLoginTemplate from "./template.js";

export const LOGIN_VIEW_VERSION = "login.view.public.controller.v7-document-handoff";

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
    node.focus({ preventScroll: true });
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

function redirectTargetFromLocation(router = null) {
  if (!isBrowser()) return "";

  let candidate = "";

  try {
    candidate = new URLSearchParams(
      window.location.search || ""
    ).get("redirect") || "";
  } catch {
    return "";
  }

  candidate = cleanText(candidate, "");

  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\r\n\t\\]/.test(candidate)
  ) {
    return "";
  }

  try {
    const match = router?.getRouteMatch?.(candidate);

    if (
      !match?.route ||
      match.route.public === true ||
      match.blocked === true ||
      match.sensitive === true
    ) {
      return "";
    }

    const safe = isFunction(router?.safePublicPath)
      ? router.safePublicPath(candidate)
      : candidate;

    if (
      !safe ||
      !safe.startsWith("/") ||
      safe.startsWith("//")
    ) {
      return "";
    }

    return safe;
  } catch {
    return "";
  }
}

function resolvePostLoginTarget(result = {}, auth = null, context = {}) {
  const router = getRouter(context);
  const redirected = redirectTargetFromLocation(router);

  if (redirected) return redirected;

  const fallback = cleanText(
    result?.postLoginTarget ||
      result?.homePath ||
      result?.defaultHome ||
      auth?.getPostLoginTarget?.() ||
      auth?.getDefaultHome?.() ||
      "/",
    "/"
  );

  try {
    const safe = isFunction(router?.safePublicPath)
      ? router.safePublicPath(fallback)
      : fallback;
    const match = router?.getRouteMatch?.(safe);

    if (
      match?.route &&
      match.route.public !== true &&
      match.blocked !== true &&
      match.sensitive !== true
    ) {
      return safe;
    }
  } catch {
    // fallback abajo
  }

  return cleanText(
    auth?.getDefaultHome?.() || "/",
    "/"
  );
}

async function handoffAfterLogin(result = {}, context = {}) {
  const router = getRouter(context);
  const auth = getAuth(context);

  if (auth?.isAuthenticated?.() !== true) {
    throw new Error("La sesión no quedó autenticada.");
  }

  const target = resolvePostLoginTarget(result, auth, context);

  /*
    La frontera guest -> private es una frontera de documento.
    El panel nace desde boot con Auth ya válida; no intentamos convertir
    el runtime público del login en el runtime privado en caliente.
  */
  if (isBrowser()) {
    try {
      window.location.replace(target);

      return {
        ok: true,
        documentNavigation: true,
        target,
      };
    } catch {
      try {
        window.location.assign(target);

        return {
          ok: true,
          documentNavigation: true,
          target,
        };
      } catch {
        // fallback Router para entornos sin navegación de documento.
      }
    }
  }

  const options = {
    source: "login.view.fallback-router",
    replaceState: true,
    force: true,
  };

  if (isFunction(router?.goAfterLogin)) {
    return router.goAfterLogin(target, options);
  }

  if (isFunction(router?.replace)) {
    return router.replace(target, options);
  }

  if (isFunction(router?.navigate)) {
    return router.navigate(target, options);
  }

  throw new Error("No se pudo abandonar la vista de acceso.");
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
    password: root.querySelector(
      "[data-login-password], [data-password-input]"
    ),
    submit: root.querySelector("[data-login-submit]"),
    submitLabel: root.querySelector("[data-login-submit-label]"),

    globalError: root.querySelector("[data-login-global-error]"),
    identifierError: root.querySelector(
      "[data-login-error='identifier']"
    ),
    passwordError: root.querySelector(
      "[data-login-error='password']"
    ),

    passwordWrapper: root.querySelector("[data-password-wrapper]"),
    passwordToggle: root.querySelector(
      "[data-password-toggle], [data-login-password-toggle]"
    ),
    passwordCaps: root.querySelector("[data-password-caps]"),
    passwordEye: root.querySelector(".password-eye-icon"),
    passwordEyeOff: root.querySelector(".password-eye-off-icon"),
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

function setPasswordVisible(refs, visible = false) {
  const value = Boolean(visible);
  const type = value ? "text" : "password";

  if (!refs.password) return false;

  try {
    refs.password.type = type;
  } catch {
    refs.password.setAttribute("type", type);
  }

  refs.password.dataset.passwordVisible = value ? "true" : "false";

  if (refs.passwordToggle) {
    refs.passwordToggle.setAttribute(
      "aria-pressed",
      value ? "true" : "false"
    );
    refs.passwordToggle.setAttribute(
      "aria-label",
      value ? "Ocultar contraseña" : "Mostrar contraseña"
    );
    refs.passwordToggle.dataset.passwordVisible = value ? "true" : "false";
  }

  if (refs.passwordWrapper) {
    refs.passwordWrapper.dataset.passwordVisible = value ? "true" : "false";
  }

  setHidden(refs.passwordEye, value);
  setHidden(refs.passwordEyeOff, !value);

  return true;
}

function setCapsVisible(refs, visible = false) {
  const value = Boolean(visible);

  if (refs.passwordCaps) {
    refs.passwordCaps.hidden = !value;

    if (value) {
      refs.passwordCaps.removeAttribute("hidden");
    } else {
      refs.passwordCaps.setAttribute("hidden", "");
    }
  }

  if (refs.passwordWrapper) {
    refs.passwordWrapper.dataset.capsLock = value ? "true" : "false";
  }

  return true;
}

function initPasswordControls(refs) {
  let destroyed = false;
  let visible = false;

  function toggleVisibility(event = null) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (destroyed) return false;
    if (!refs.password || refs.password.disabled) return false;
    if (refs.passwordToggle?.disabled) return false;

    visible = !visible;

    setPasswordVisible(refs, visible);
    focusSafe(refs.password);

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

  refs.passwordToggle?.addEventListener("mousedown", keepPasswordFocus);
  refs.passwordToggle?.addEventListener("click", toggleVisibility);

  refs.password?.addEventListener("keydown", syncCaps);
  refs.password?.addEventListener("keyup", syncCaps);
  refs.password?.addEventListener("keypress", syncCaps);
  refs.password?.addEventListener("blur", hideCaps);

  setPasswordVisible(refs, false);
  setCapsVisible(refs, false);

  return {
    setDisabled(disabled = false) {
      if (refs.passwordToggle) {
        refs.passwordToggle.disabled = Boolean(disabled);
      }

      return true;
    },

    destroy() {
      destroyed = true;
      visible = false;

      try {
        refs.passwordToggle?.removeEventListener(
          "mousedown",
          keepPasswordFocus
        );
        refs.passwordToggle?.removeEventListener(
          "click",
          toggleVisibility
        );

        refs.password?.removeEventListener("keydown", syncCaps);
        refs.password?.removeEventListener("keyup", syncCaps);
        refs.password?.removeEventListener("keypress", syncCaps);
        refs.password?.removeEventListener("blur", hideCaps);
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
        available: Boolean(refs.password && refs.passwordToggle),
        visible,
        capsVisible: refs.passwordCaps?.hidden === false,
      };
    },
  };
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

  refs.globalError.textContent = cleanText(
    message,
    "No se pudo iniciar sesión."
  );
  refs.globalError.hidden = false;

  return true;
}

function setSubmitLabel(refs, loading = false) {
  const submit = refs?.submit;

  if (!submit) return false;

  const defaultText = cleanText(
    submit.dataset.defaultText,
    "Entrar al panel"
  );
  const loadingText = cleanText(
    submit.dataset.loadingText,
    "Accediendo..."
  );

  const target = refs.submitLabel || submit;

  target.textContent = loading ? loadingText : defaultText;

  return true;
}

function setLoading(refs, loading = false, passwordControls = null) {
  const value = Boolean(loading);
  const busy = value ? "true" : "false";

  for (const node of [
    refs.identifier,
    refs.password,
    refs.submit,
  ].filter(Boolean)) {
    node.disabled = value;
  }

  passwordControls?.setDisabled?.(value);

  if (refs.submit) {
    refs.submit.dataset.loading = busy;
    refs.submit.setAttribute("aria-busy", busy);
    setSubmitLabel(refs, value);
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

  focusSafe(firstInvalid);

  return Object.keys(errors).length > 0;
}

function authErrorMessage(error = null) {
  const status = Number(
    error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      0
  );

  const code = cleanText(
    error?.code || error?.error || "",
    ""
  ).toUpperCase();

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

  return cleanText(
    error?.message || "",
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

export function renderLoginView(container, context = {}) {
  if (!isBrowser()) return null;

  if (!container) {
    throw new Error("[LoginView] container requerido.");
  }

  destroyPrevious(container);

  const auth = getAuth(context);
  const view = mountTemplate(container);
  const refs = getRefs(view);
  const passwordControls = initPasswordControls(refs);

  let mounted = true;
  let submitting = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setLoading(refs, submitting, passwordControls);
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

      if (
        result?.authenticated !== true &&
        auth.isAuthenticated?.() !== true
      ) {
        throw new Error("Login inválido.");
      }

      auth.syncAuthState?.();

      const navigation = await handoffAfterLogin(result || {}, {
        ...context,
        Auth: auth,
      });

      if (!mounted) return false;

      if (navigation === false || navigation?.ok === false) {
        throw new Error(
          "No se pudo completar la salida del login."
        );
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

  focusSafe(refs.identifier);

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
      const activeAuth = getAuth(context);
      const authenticated =
        activeAuth?.isAuthenticated?.() === true;

      return {
        version: LOGIN_VIEW_VERSION,
        mounted,
        submitting,
        authenticated,
        passwordControls: passwordControls.getSnapshot(),
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

/* =========================================================
   Onion Support - Activate Account View
   Archivo: /src/views/activate-account/index.js

   Responsabilidad:
   - Vista mínima de activación.
   - Ruta: /activate-account?token=...
   - Token param único: token.
   - Pedir contraseña y confirmación.
   - Llamar Auth.activateAccount().
   - Mostrar mensaje en DOM.
   - Navegar a /login tras éxito.
   - Sin fetch directo.
   - Sin CoreHttp directo.
   - Sin Toast.
   - Sin storage.
   - Sin loader propio.
   - Sin fallback template.
   - Sin eventos globales.
   - Sin token real en snapshot.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import * as ActivateTemplate from "./activate-account.template.js";

export const ACTIVATE_ACCOUNT_VIEW_VERSION = "activate-account.view.v2";

const SOURCE = "activate-account.view";

const ROUTE = "/activate-account";
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

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isFunction(value) {
  return typeof value === "function";
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
   PATH / TOKEN
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

function normalizeCanonicalPath(path = "/") {
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
        ROUTE
    );
  }

  try {
    const hash = window.location.hash || "";

    if (hash.startsWith("#/") || hash.startsWith("#!")) {
      return normalizePublicPath(hash);
    }

    return normalizePublicPath(
      `${window.location.pathname || ROUTE}${window.location.search || ""}${hash}`
    );
  } catch {
    return ROUTE;
  }
}

function currentPath() {
  return normalizeCanonicalPath(currentPublicPath());
}

function isActivateRoute() {
  return currentPath() === ROUTE;
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

  const hashQuery =
    raw.includes("#") && raw.split("#").slice(1).join("#").includes("?")
      ? raw.split("#").slice(1).join("#").split("?").slice(1).join("?")
      : "";

  return tokenFromQuery(query) || tokenFromQuery(hashQuery);
}

function getUrlToken() {
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

/* =========================================================
   NAVIGATION
========================================================= */

function isSafeInternalPath(path = "") {
  const value = text(path, "");

  return Boolean(
    value &&
      value.startsWith("/") &&
      !value.startsWith("//") &&
      !/^[a-z][a-z0-9+.-]*:/i.test(value) &&
      !/[\r\n\t\\]/.test(value)
  );
}

function safeInternalPath(path = "", fallback = LOGIN_ROUTE) {
  const candidate = normalizePublicPath(path || fallback);
  return isSafeInternalPath(candidate) ? candidate : fallback;
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

    if (isFunction(AppCore?.navigate)) {
      await AppCore.navigate(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
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
   DOM
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

function query(root = null, selector = "") {
  if (!root || !selector) return null;

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function setAttr(node = null, name = "", value = null) {
  if (!node || !name) return false;

  try {
    if (value === null || value === undefined || value === false || value === "") {
      node.removeAttribute(name);
    } else {
      node.setAttribute(name, String(value));
    }

    return true;
  } catch {
    return false;
  }
}

function setHidden(node = null, hidden = false) {
  if (!node) return false;

  const value = Boolean(hidden);

  try {
    node.hidden = value;
  } catch {
    // noop
  }

  setAttr(node, "aria-hidden", value ? "true" : "false");

  return true;
}

function setBusy(node = null, busy = false) {
  return setAttr(node, "aria-busy", busy ? "true" : "false");
}

function setDisabled(node = null, disabled = false) {
  if (!node) return false;

  const value = Boolean(disabled);

  try {
    node.disabled = value;
  } catch {
    // noop
  }

  setAttr(node, "aria-disabled", value ? "true" : null);

  return true;
}

function toggleClass(node = null, className = "", enabled = false) {
  if (!node || !className) return false;

  try {
    node.classList.toggle(className, Boolean(enabled));
    return true;
  } catch {
    return false;
  }
}

function bindDom(node = null, eventName = "", handler = null, options = false) {
  if (!node || !eventName || !isFunction(handler)) return () => false;

  let disposed = false;

  try {
    node.addEventListener(eventName, handler, options);
  } catch {
    return () => false;
  }

  return () => {
    if (disposed) return false;

    disposed = true;

    try {
      node.removeEventListener(eventName, handler, options);
    } catch {
      // noop
    }

    return true;
  };
}

function createMessageNode() {
  if (!isBrowser()) return null;

  const node = document.createElement("div");

  node.className = "activate-account-message";
  node.dataset.activateAccountMessage = "true";
  node.dataset.activateAccountError = "true";
  node.setAttribute("role", "alert");
  node.setAttribute("aria-live", "polite");
  node.setAttribute("aria-atomic", "true");
  node.hidden = true;

  return node;
}

function getMessageNode(container = null, form = null) {
  const found =
    query(container, "[data-activate-account-message]") ||
    query(container, "[data-activate-message]") ||
    query(container, "[data-activate-account-error]") ||
    query(container, "#activateAccountError") ||
    query(container, ".activate-account-message");

  if (found) return found;

  const node = createMessageNode();

  if (!node) return null;

  try {
    form?.prepend?.(node);
  } catch {
    try {
      container?.prepend?.(node);
    } catch {
      // noop
    }
  }

  return node;
}

function setMessage(node = null, message = "", type = "error") {
  if (!node) return false;

  const clean = text(message, "");
  const cleanType = ["error", "success", "info"].includes(type) ? type : "error";

  try {
    node.textContent = clean;
    setHidden(node, !clean);

    toggleClass(node, "is-error", clean && cleanType === "error");
    toggleClass(node, "is-success", clean && cleanType === "success");
    toggleClass(node, "is-info", clean && cleanType === "info");

    if (clean) {
      node.dataset.messageType = cleanType;
    } else {
      delete node.dataset.messageType;
    }

    return true;
  } catch {
    return false;
  }
}

function setFieldError(field = null, message = "") {
  if (!field) return false;

  const clean = text(message, "");

  setAttr(field, "aria-invalid", clean ? "true" : "false");

  try {
    if (clean) {
      field.dataset.error = clean;
    } else {
      delete field.dataset.error;
    }
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   TEMPLATE
========================================================= */

function templateHtml(deps = {}) {
  const renderer =
    ActivateTemplate.getActivateAccountTemplate ||
    ActivateTemplate.default;

  if (!isFunction(renderer)) {
    throw new Error("activate-account.template.js no exporta template válido.");
  }

  const html = renderer({
    ...deps,
    appName: text(AppCore?.config?.appName, "Onion Support"),
    hasToken: Boolean(getUrlToken()),
    tokenCaptured: Boolean(getUrlToken()),
    token: "",
    loginHref: LOGIN_ROUTE,
    backHref: LOGIN_ROUTE,
    autoSubmit: false,
  });

  if (typeof html !== "string" || !html.includes("<")) {
    throw new Error("Template de activación inválido.");
  }

  return html;
}

function renderTemplate(container, deps = {}) {
  const template = document.createElement("template");

  template.innerHTML = templateHtml(deps);

  container.replaceChildren(template.content.cloneNode(true));

  return true;
}

/* =========================================================
   REFS / FORM
========================================================= */

function getRefs(container = null) {
  const form =
    query(container, "[data-activate-account-form]") ||
    query(container, "[data-activate-form]") ||
    query(container, "#activateAccountForm") ||
    query(container, "form") ||
    null;

  return {
    form,

    password:
      query(container, "[name='password']") ||
      query(container, "[data-activate-account-password]") ||
      query(container, "#activateAccountPassword") ||
      null,

    confirmPassword:
      query(container, "[name='confirmPassword']") ||
      query(container, "[name='passwordConfirmation']") ||
      query(container, "[data-activate-account-confirm]") ||
      query(container, "#activateAccountPasswordConfirm") ||
      null,

    submit:
      query(container, "[data-activate-account-submit]") ||
      query(container, "#activateAccountButton") ||
      query(container, "button[type='submit']") ||
      null,

    back:
      query(container, "[data-activate-account-back]") ||
      query(container, ".activate-account-back-link") ||
      query(container, "a[href='/login']") ||
      null,
  };
}

function refsReady(refs = {}) {
  return Boolean(refs.form && refs.password && refs.confirmPassword && refs.submit);
}

function readPayload(refs = {}, token = "") {
  return {
    token: normalizeToken(token),
    password: String(refs.password?.value || ""),
    confirmPassword: String(refs.confirmPassword?.value || ""),
  };
}

function validatePayload(payload = {}) {
  const errors = {};

  if (!normalizeToken(payload.token)) {
    errors.token = "El enlace de activación no es válido.";
  }

  if (!String(payload.password || "")) {
    errors.password = "Introduce una contraseña.";
  }

  if (!String(payload.confirmPassword || "")) {
    errors.confirmPassword = "Confirma la contraseña.";
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

function firstError(errors = {}) {
  return Object.values(errors).find(Boolean) || "";
}

function clearErrors(refs = {}, messageNode = null) {
  setMessage(messageNode, "");
  setFieldError(refs.password, "");
  setFieldError(refs.confirmPassword, "");

  return true;
}

function applyErrors(refs = {}, messageNode = null, errors = {}) {
  setFieldError(refs.password, errors.password || "");
  setFieldError(refs.confirmPassword, errors.confirmPassword || "");
  setMessage(messageNode, firstError(errors), "error");

  const firstField =
    errors.password
      ? refs.password
      : errors.confirmPassword
        ? refs.confirmPassword
        : null;

  try {
    firstField?.focus?.();
  } catch {
    // noop
  }

  return true;
}

function setLoading(refs = {}, loading = false) {
  const active = Boolean(loading);

  setBusy(refs.form, active);

  setDisabled(refs.password, active);
  setDisabled(refs.confirmPassword, active);
  setDisabled(refs.submit, active);

  if (refs.submit) {
    try {
      if (!refs.submit.dataset.defaultLabel) {
        refs.submit.dataset.defaultLabel = refs.submit.textContent;
      }

      refs.submit.textContent = active
        ? "Activando..."
        : refs.submit.dataset.defaultLabel;
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   RESULT / ERROR
========================================================= */

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
      result?.description ||
      fallback,
    fallback
  );
}

function errorMessage(error = null, fallback = "No se pudo activar la cuenta.") {
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
   INSTANCE
========================================================= */

function destroyPrevious(container = null) {
  const previous = INSTANCES.get(container);

  if (previous?.destroy) {
    previous.destroy({ remount: true });
    return true;
  }

  return false;
}

function storeInstance(container = null, instance = null) {
  if (!container || !instance) return false;

  INSTANCES.set(container, instance);
  lastInstance = instance;

  return true;
}

function clearInstance(container = null, instance = null) {
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

export function renderActivateAccountView(containerArg = null, deps = {}) {
  const container = isContainer(containerArg) ? containerArg : getContainer();

  if (!container) {
    return {
      ok: false,
      missingContainer: true,
    };
  }

  const options = isObject(deps) ? deps : {};
  const token = normalizeToken(options.token || getUrlToken());

  destroyPrevious(container);
  renderTemplate(container, options);

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

    if (!mounted || submitting) {
      return false;
    }

    clearErrors(refs, messageNode);

    if (!refsReady(refs)) {
      setMessage(messageNode, "No se pudo preparar el formulario de activación.", "error");
      return false;
    }

    const payload = readPayload(refs, token);
    const errors = validatePayload(payload);

    if (Object.keys(errors).length) {
      applyErrors(refs, messageNode, errors);
      return false;
    }

    if (!isFunction(Auth?.activateAccount)) {
      setMessage(messageNode, "Auth.activateAccount no está disponible.", "error");
      return false;
    }

    setSubmitting(true);

    try {
      const result = await Auth.activateAccount(
        {
          token: payload.token,
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

      if (!resultOk(result)) {
        throw result || new Error("ACTIVATION_FAILED");
      }

      setMessage(
        messageNode,
        resultMessage(result, "Cuenta activada correctamente. Ya puedes iniciar sesión."),
        "success"
      );

      if (mounted && isActivateRoute()) {
        await navigateTo(LOGIN_ROUTE);
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

  const disposers = [
    bindDom(refs.form, "submit", submit),
    bindDom(refs.password, "input", () => clearErrors(refs, messageNode)),
    bindDom(refs.confirmPassword, "input", () => clearErrors(refs, messageNode)),
    bindDom(refs.back, "click", (event) => {
      try {
        event?.preventDefault?.();
      } catch {
        // noop
      }

      navigateTo(LOGIN_ROUTE);
    }),
  ];

  if (!token) {
    setMessage(
      messageNode,
      "No se ha encontrado un enlace de activación válido.",
      "error"
    );
  }

  try {
    refs.password?.focus?.();
  } catch {
    // noop
  }

  const instance = {
    version: ACTIVATE_ACCOUNT_VIEW_VERSION,

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
        setLoading(refs, false);
      } catch {
        // noop
      }

      clearInstance(container, instance);

      return true;
    },

    getSnapshot() {
      return {
        version: ACTIVATE_ACCOUNT_VIEW_VERSION,
        source: SOURCE,

        mounted,
        submitting,

        route: currentPath(),
        stillOnActivate: isActivateRoute(),

        hasToken: Boolean(token),

        dom: {
          hasForm: Boolean(refs.form),
          hasPassword: Boolean(refs.password),
          hasConfirmPassword: Boolean(refs.confirmPassword),
          hasSubmit: Boolean(refs.submit),
          hasMessage: Boolean(messageNode),
        },

        policy: {
          tokenParam: TOKEN_PARAM,
          noFetchDirect: true,
          noCoreHttpDirect: true,
          noToast: true,
          noStorage: true,
          noLoaderOwn: true,
          noEventsGlobal: true,
          noTokenInSnapshot: true,
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
  return renderActivateAccountView(container, deps);
}

export function render(arg1 = null, arg2 = {}) {
  const { container, deps } = resolveArgs(arg1, arg2);
  return renderActivateAccountView(container, deps);
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
    version: ACTIVATE_ACCOUNT_VIEW_VERSION,
    source: SOURCE,
    mounted: false,
    route: currentPath(),
    hasToken: Boolean(getUrlToken()),
  };
}

export const getDebugSnapshot = getSnapshot;

export const ActivateAccountView = {
  version: ACTIVATE_ACCOUNT_VIEW_VERSION,

  init,
  render,
  mount,
  destroy,

  activate() {
    return lastInstance?.submit?.() || false;
  },

  getSnapshot,
  getState: getSnapshot,
  getDebugSnapshot,
};

export default ActivateAccountView;

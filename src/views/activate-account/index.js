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
   - Sin password-field compartido.
   - Sin storage.
   - Sin shell manual complejo.
   - Sin token real en snapshot.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import * as ActivateTemplate from "./activate-account.template.js";

export const ACTIVATE_ACCOUNT_VIEW_VERSION = "simple";

const SOURCE = "activate-account.view";
const ROUTE = "/activate-account";
const LOGIN_ROUTE = "/login";

const INSTANCE_KEY = "__ONION_ACTIVATE_ACCOUNT_VIEW_INSTANCE__";

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

function nowIso() {
  return new Date().toISOString();
}

function emit(eventName = "", payload = {}) {
  try {
    AppCore?.events?.emit?.(eventName, {
      source: SOURCE,
      version: ACTIVATE_ACCOUNT_VIEW_VERSION,
      at: nowIso(),
      ...payload,
      token: null,
      accessToken: null,
      refreshToken: null,
    });

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   PATH / TOKEN
========================================================= */

function normalizePublicPath(path = "/") {
  let value = text(path, "/");

  if (value.startsWith("#/")) value = value.slice(1);
  if (value.startsWith("#!")) value = value.replace(/^#!\/?/, "/");

  if (!value.startsWith("/")) value = `/${value}`;

  value = value.replace(/\/{2,}/g, "/");

  return value || "/";
}

function normalizeCanonicalPath(path = "/") {
  let value = normalizePublicPath(path).split("?")[0].split("#")[0] || "/";

  if (value.length > 1) {
    value = value.replace(/\/+$/g, "");
  }

  return value || "/";
}

function currentPath() {
  if (!isBrowser()) {
    return AppCore?.state?.publicPath || AppCore?.state?.route || ROUTE;
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

function isActivateRoute() {
  return normalizeCanonicalPath(currentPath()) === ROUTE;
}

function normalizeToken(value = "") {
  const token = text(value, "").replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";

  if (
    ["null", "undefined", "false", "true", "[object object]", "{}", "[]"].includes(
      token.toLowerCase()
    )
  ) {
    return "";
  }

  return token;
}

function tokenFromSearch(search = "") {
  const raw = text(search, "");

  if (!raw) return "";

  try {
    const params = new URLSearchParams(raw.startsWith("?") ? raw : `?${raw}`);
    return normalizeToken(params.get("token"));
  } catch {
    return "";
  }
}

function tokenFromHash(hash = "") {
  const raw = text(hash, "");

  if (!raw || !raw.includes("?")) return "";

  const query = raw.split("?").slice(1).join("?");

  return tokenFromSearch(query ? `?${query}` : "");
}

function getUrlToken() {
  if (!isBrowser()) return "";

  try {
    return tokenFromSearch(window.location.search) || tokenFromHash(window.location.hash);
  } catch {
    return "";
  }
}

/* =========================================================
   NAVIGATION
========================================================= */

function isSafeInternalPath(path = "") {
  const value = text(path, "");

  if (!value) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return false;
  if (/[\r\n\t\\]/.test(value)) return false;

  return true;
}

function safeInternalPath(path = "", fallback = LOGIN_ROUTE) {
  const candidate = normalizePublicPath(path || fallback);

  return isSafeInternalPath(candidate) ? candidate : fallback;
}

function getRouter() {
  try {
    return AppCore?.Router || AppCore?.router || AppCore?.modules?.get?.("Router") || AppCore?.modules?.get?.("router") || null;
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

function query(root, selector = "") {
  if (!root || !selector) return null;

  try {
    return root.querySelector(selector);
  } catch {
    return null;
  }
}

function setHidden(node, hidden = false) {
  if (!node) return false;

  try {
    node.hidden = Boolean(hidden);
    node.setAttribute("aria-hidden", hidden ? "true" : "false");
    return true;
  } catch {
    return false;
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

  node.className = "activate-account-message";
  node.dataset.activateAccountMessage = "true";
  node.setAttribute("role", "alert");
  node.setAttribute("aria-live", "polite");
  node.hidden = true;

  return node;
}

function getMessageNode(container, form) {
  return (
    query(container, "[data-activate-account-message]") ||
    query(container, "[data-activate-message]") ||
    query(container, "[data-activate-account-error]") ||
    query(container, "#activateAccountError") ||
    query(container, ".activate-account-message") ||
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

function hideLoader() {
  if (!isBrowser()) return false;

  try {
    document.documentElement.classList.remove("app-loading", "app-booting", "loading");
    document.body.classList.remove("app-loading", "app-booting", "loading", "is-loading");
  } catch {
    // noop
  }

  const loader = document.getElementById("app-loader");

  if (loader) {
    setHidden(loader, true);
    setBusy(loader, false);

    try {
      loader.classList.remove("is-visible");
    } catch {
      // noop
    }
  }

  try {
    AppCore?.setLoading?.(false);
  } catch {
    // noop
  }

  return true;
}

/* =========================================================
   TEMPLATE
========================================================= */

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fallbackTemplate() {
  return `
    <section
      class="activate-account-view"
      data-view="activate-account"
      data-activate-account-view="true"
    >
      <article class="activate-account-card">
        <header class="activate-account-header">
          <h1>Activar cuenta</h1>
          <p>Define una contraseña para activar tu cuenta.</p>
        </header>

        <form
          id="activateAccountForm"
          class="activate-account-form"
          data-activate-account-form="true"
          data-activate-form="true"
          novalidate
        >
          <div
            class="activate-account-message"
            id="activateAccountError"
            data-activate-account-message="true"
            data-activate-account-error="true"
            role="alert"
            aria-live="polite"
            hidden
          ></div>

          <div class="activate-account-field">
            <label for="activateAccountPassword">Contraseña</label>
            <input
              id="activateAccountPassword"
              name="password"
              type="password"
              autocomplete="new-password"
              data-activate-account-password="true"
              required
            />
          </div>

          <div class="activate-account-field">
            <label for="activateAccountPasswordConfirm">Confirmar contraseña</label>
            <input
              id="activateAccountPasswordConfirm"
              name="confirmPassword"
              type="password"
              autocomplete="new-password"
              data-activate-account-confirm="true"
              required
            />
          </div>

          <button
            id="activateAccountButton"
            type="submit"
            data-activate-account-submit="true"
          >
            Activar cuenta
          </button>

          <p class="activate-account-back">
            <a href="/login" data-spa data-activate-account-back="true">
              Volver al acceso
            </a>
          </p>
        </form>
      </article>
    </section>
  `;
}

function templateHtml(deps = {}) {
  const renderer =
    ActivateTemplate.getActivateAccountTemplate ||
    ActivateTemplate.default;

  if (isFunction(renderer)) {
    try {
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

      if (typeof html === "string" && html.includes("<")) {
        return html;
      }
    } catch {
      // fallback abajo
    }
  }

  return fallbackTemplate();
}

function renderTemplate(container, deps = {}) {
  try {
    container.innerHTML = templateHtml(deps);
    return true;
  } catch {
    try {
      container.innerHTML = fallbackTemplate();
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   REFS / FORM
========================================================= */

function getRefs(container) {
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
      query(container, "button[type='submit']") ||
      query(container, "[data-activate-account-submit]") ||
      query(container, "#activateAccountButton") ||
      null,

    back:
      query(container, "[data-activate-account-back]") ||
      query(container, "a[href='/login']") ||
      null,
  };
}

function refsNeedFallback(refs) {
  return !refs.form || !refs.password || !refs.confirmPassword || !refs.submit;
}

function ensureTemplateShape(container, deps) {
  let refs = getRefs(container);

  if (refsNeedFallback(refs)) {
    container.innerHTML = fallbackTemplate(deps);
    refs = getRefs(container);
  }

  return refs;
}

function readPayload(refs, token) {
  return {
    token: normalizeToken(token),
    password: String(refs.password?.value || ""),
    confirmPassword: String(refs.confirmPassword?.value || ""),
  };
}

function validatePayload(payload = {}) {
  const errors = {};

  if (!normalizeToken(payload.token)) {
    errors.token = "El token de activación no es válido.";
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

function clearErrors(refs, messageNode) {
  setMessage(messageNode, "");
  setFieldError(refs.password, "");
  setFieldError(refs.confirmPassword, "");
}

function applyErrors(refs, messageNode, errors = {}) {
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
}

function setLoading(refs, loading = false) {
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
  return text(
    error?.message ||
      error?.data?.message ||
      error?.response?.data?.message ||
      error?.mensaje ||
      error?.error,
    fallback
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

export function renderActivateAccountView(containerArg = null, deps = {}) {
  const container = isContainer(containerArg) ? containerArg : getContainer();

  if (!container) {
    return {
      ok: false,
      missingContainer: true,
    };
  }

  const options = isObject(deps) ? deps : {};
  const token = getUrlToken();

  destroyPrevious(container);
  renderTemplate(container, options);

  const refs = ensureTemplateShape(container, options);
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

    emit("auth:activate-account:view:submit:start");

    try {
      const result = await Auth.activateAccount(
        {
          token: payload.token,
          password: payload.password,
          confirmPassword: payload.confirmPassword,
        },
        {
          source: SOURCE,
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

      emit("auth:activate-account:view:submit:done", {
        ok: true,
        sessionApplied: Boolean(result?.sessionApplied),
      });

      if (mounted && isActivateRoute()) {
        await navigateTo(result?.redirectTo || LOGIN_ROUTE);
      }

      return true;
    } catch (error) {
      const message = errorMessage(error);

      setMessage(messageNode, message, "error");

      emit("auth:activate-account:view:error", {
        message,
        status: error?.status || error?.statusCode || 0,
        code: error?.code || null,
      });

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

  for (const field of [refs.password, refs.confirmPassword]) {
    try {
      field?.addEventListener?.("input", clearOnInput);
      disposers.push(() => field?.removeEventListener?.("input", clearOnInput));
    } catch {
      // noop
    }
  }

  try {
    refs.back?.addEventListener?.("click", (event) => {
      event.preventDefault();
      navigateTo(LOGIN_ROUTE);
    });
  } catch {
    // noop
  }

  if (!token) {
    setMessage(
      messageNode,
      "No se ha encontrado un token de activación válido.",
      "error"
    );
  }

  try {
    refs.password?.focus?.();
  } catch {
    // noop
  }

  hideLoader();

  emit("auth:activate-account:view:ready", {
    hasToken: Boolean(token),
  });

  const instance = {
    version: ACTIVATE_ACCOUNT_VIEW_VERSION,

    submit,

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
      emit("auth:activate-account:view:destroyed");

      return true;
    },

    getSnapshot() {
      return {
        version: ACTIVATE_ACCOUNT_VIEW_VERSION,
        source: SOURCE,

        mounted,
        submitting,

        route: normalizeCanonicalPath(currentPath()),
        stillOnActivate: isActivateRoute(),

        hasToken: Boolean(token),

        dom: {
          hasForm: Boolean(refs.form),
          hasPassword: Boolean(refs.password),
          hasConfirmPassword: Boolean(refs.confirmPassword),
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
    version: ACTIVATE_ACCOUNT_VIEW_VERSION,
    source: SOURCE,
    mounted: false,
    route: normalizeCanonicalPath(currentPath()),
    hasToken: Boolean(getUrlToken()),
    at: nowIso(),
  };
}

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
  getDebugSnapshot: getSnapshot,
};

export default ActivateAccountView;

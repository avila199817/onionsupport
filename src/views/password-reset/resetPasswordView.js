/* =========================================================
   Onion Support - Password Reset View
   Archivo: /src/views/password-reset/resetPasswordView.js

   Responsabilidad:
   - Una vista mínima para:
     /password-request
     /password-reset?token=...
   - Request: pedir enlace de recuperación.
   - Confirm: cambiar contraseña con token.
   - Sin Toast.
   - Sin bridge.
   - Sin helpers DOM externos.
   - Sin Store.
   - Sin HTTP directo.
   - Sin Router paralelo.
   - Sin cleanup registry complejo.
   - Sin rutas legacy.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import { getResetPasswordTemplate } from "./reset-password.template.js";

export const RESET_PASSWORD_VIEW_VERSION = "simple";

const SOURCE = "password-reset.view";

const PASSWORD_REQUEST_ROUTE = "/password-request";
const PASSWORD_RESET_ROUTE = "/password-reset";
const LOGIN_ROUTE = "/login";

const INSTANCE_KEY = "__ONION_PASSWORD_RESET_VIEW_INSTANCE__";

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
      version: RESET_PASSWORD_VIEW_VERSION,
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
   PATHS
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
    return AppCore?.state?.publicPath || AppCore?.state?.route || "/";
  }

  try {
    const hash = window.location.hash || "";

    if (hash.startsWith("#/") || hash.startsWith("#!")) {
      return normalizePublicPath(hash);
    }

    return normalizePublicPath(
      `${window.location.pathname || "/"}${window.location.search || ""}${hash}`
    );
  } catch {
    return "/";
  }
}

function currentCanonicalPath() {
  return normalizeCanonicalPath(currentPath());
}

function currentMode() {
  return currentCanonicalPath() === PASSWORD_RESET_ROUTE && getUrlToken()
    ? "confirm"
    : "request";
}

function isPasswordResetRoute() {
  const path = currentCanonicalPath();

  return path === PASSWORD_REQUEST_ROUTE || path === PASSWORD_RESET_ROUTE;
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
   TOKEN
========================================================= */

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

  node.className = "password-reset-message";
  node.dataset.passwordResetMessage = "true";
  node.setAttribute("role", "alert");
  node.setAttribute("aria-live", "polite");
  node.hidden = true;

  return node;
}

function getMessageNode(container, form) {
  return (
    query(container, "[data-password-reset-message]") ||
    query(container, "[data-reset-password-message]") ||
    query(container, "[data-password-reset-error]") ||
    query(container, "[data-reset-password-error]") ||
    query(container, ".password-reset-message") ||
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

function fallbackTemplate(mode = "request") {
  const isConfirm = mode === "confirm";
  const appName = text(AppCore?.config?.appName, "Onion Support");

  return `
    <section
      class="password-reset-view"
      data-view="password-reset"
      data-password-reset-view="true"
      data-password-reset-mode="${isConfirm ? "confirm" : "request"}"
    >
      <article class="password-reset-card">
        <header class="password-reset-header">
          <h1 class="password-reset-title">${isConfirm ? "Nueva contraseña" : "Recuperar acceso"}</h1>
          <p class="password-reset-subtitle">
            ${isConfirm ? `Define una nueva contraseña para ${appName}.` : `Introduce tu usuario o email de ${appName}.`}
          </p>
        </header>

        <form
          class="password-reset-form"
          data-password-reset-form="true"
          data-reset-password-form="true"
          novalidate
        >
          <div
            class="password-reset-message"
            data-password-reset-message="true"
            data-password-reset-error="true"
            role="alert"
            aria-live="polite"
            hidden
          ></div>

          ${
            isConfirm
              ? `
                <input
                  type="hidden"
                  name="token"
                  value="${escapeHtml(getUrlToken())}"
                  data-password-reset-token="true"
                />

                <div class="password-reset-field">
                  <label for="resetPassword">Nueva contraseña</label>
                  <input
                    id="resetPassword"
                    name="password"
                    type="password"
                    autocomplete="new-password"
                    data-password-reset-password="true"
                    required
                  />
                </div>

                <div class="password-reset-field">
                  <label for="resetConfirmPassword">Confirmar contraseña</label>
                  <input
                    id="resetConfirmPassword"
                    name="confirmPassword"
                    type="password"
                    autocomplete="new-password"
                    data-password-reset-confirm="true"
                    required
                  />
                </div>
              `
              : `
                <div class="password-reset-field">
                  <label for="resetIdentifier">Usuario o email</label>
                  <input
                    id="resetIdentifier"
                    name="identifier"
                    type="text"
                    autocomplete="username"
                    data-password-reset-identifier="true"
                    data-reset-password-identifier="true"
                    required
                  />
                </div>
              `
          }

          <button
            class="password-reset-submit"
            type="submit"
            data-password-reset-submit="true"
            data-reset-password-submit="true"
          >
            ${isConfirm ? "Cambiar contraseña" : "Enviar enlace"}
          </button>

          <p class="password-reset-back">
            <a href="/login" data-spa data-password-reset-back="true">Volver al acceso</a>
          </p>
        </form>
      </article>
    </section>
  `;
}

function escapeHtml(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function templateHtml(mode = "request", deps = {}) {
  try {
    const html = getResetPasswordTemplate({
      ...deps,
      mode,
      flow: mode,
      isConfirm: mode === "confirm",
      token: mode === "confirm" ? getUrlToken() : "",
      title: mode === "confirm" ? "Nueva contraseña" : "Recuperar acceso",
      submitLabel: mode === "confirm" ? "Cambiar contraseña" : "Enviar enlace",
      backHref: LOGIN_ROUTE,
    });

    if (typeof html === "string" && html.includes("<")) {
      return html;
    }
  } catch {
    // fallback abajo
  }

  return fallbackTemplate(mode);
}

function renderTemplate(container, mode = "request", deps = {}) {
  try {
    container.innerHTML = templateHtml(mode, deps);
    return true;
  } catch {
    try {
      container.innerHTML = fallbackTemplate(mode);
      return true;
    } catch {
      return false;
    }
  }
}

/* =========================================================
   REFS
========================================================= */

function getRefs(container) {
  const form =
    query(container, "[data-password-reset-form]") ||
    query(container, "[data-reset-password-form]") ||
    query(container, "form") ||
    null;

  return {
    form,

    identifier:
      query(container, "[name='identifier']") ||
      query(container, "[name='email']") ||
      query(container, "[name='username']") ||
      query(container, "[data-password-reset-identifier]") ||
      query(container, "[data-reset-password-identifier]") ||
      null,

    token:
      query(container, "[name='token']") ||
      query(container, "[data-password-reset-token]") ||
      query(container, "[data-reset-token]") ||
      null,

    password:
      query(container, "[name='password']") ||
      query(container, "[name='newPassword']") ||
      query(container, "[data-password-reset-password]") ||
      query(container, "[data-reset-password-password]") ||
      null,

    confirmPassword:
      query(container, "[name='confirmPassword']") ||
      query(container, "[name='passwordConfirmation']") ||
      query(container, "[name='confirm_password']") ||
      query(container, "[data-password-reset-confirm]") ||
      query(container, "[data-reset-password-confirm]") ||
      null,

    submit:
      query(container, "button[type='submit']") ||
      query(container, "[data-password-reset-submit]") ||
      query(container, "[data-reset-password-submit]") ||
      null,

    back:
      query(container, "[data-password-reset-back]") ||
      query(container, "[data-reset-password-back]") ||
      query(container, "a[href='/login']") ||
      null,
  };
}

function refsNeedFallback(refs, mode) {
  if (!refs.form) return true;
  if (mode === "request" && !refs.identifier) return true;
  if (mode === "confirm" && (!refs.password || !refs.confirmPassword)) return true;

  return false;
}

function ensureTemplateShape(container, mode, deps) {
  let refs = getRefs(container);

  if (refsNeedFallback(refs, mode)) {
    container.innerHTML = fallbackTemplate(mode);
    refs = getRefs(container);
  }

  return refs;
}

/* =========================================================
   FORM
========================================================= */

function readRequestPayload(refs) {
  return {
    identifier: text(refs.identifier?.value, ""),
  };
}

function readConfirmPayload(refs) {
  return {
    token: normalizeToken(refs.token?.value || getUrlToken()),
    password: String(refs.password?.value || ""),
    confirmPassword: String(refs.confirmPassword?.value || ""),
  };
}

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
    errors.token = "El token de recuperación no es válido.";
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

function firstError(errors = {}) {
  return Object.values(errors).find(Boolean) || "";
}

function clearErrors(refs, messageNode) {
  setMessage(messageNode, "");
  setFieldError(refs.identifier, "");
  setFieldError(refs.password, "");
  setFieldError(refs.confirmPassword, "");
}

function applyErrors(refs, messageNode, errors = {}) {
  setFieldError(refs.identifier, errors.identifier || "");
  setFieldError(refs.password, errors.password || "");
  setFieldError(refs.confirmPassword, errors.confirmPassword || "");

  setMessage(messageNode, firstError(errors), "error");

  const firstField =
    errors.identifier
      ? refs.identifier
      : errors.password
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
  setDisabled(refs.identifier, active);
  setDisabled(refs.password, active);
  setDisabled(refs.confirmPassword, active);
  setDisabled(refs.submit, active);

  if (refs.submit) {
    try {
      if (!refs.submit.dataset.defaultLabel) {
        refs.submit.dataset.defaultLabel = refs.submit.textContent;
      }

      refs.submit.textContent = active
        ? "Procesando..."
        : refs.submit.dataset.defaultLabel;
    } catch {
      // noop
    }
  }
}

/* =========================================================
   RESULTS
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

function errorMessage(error = null, fallback = "No se pudo completar la operación.") {
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
   ACTIONS
========================================================= */

async function requestReset(payload = {}) {
  if (!isFunction(Auth?.requestPasswordReset)) {
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
  if (!isFunction(Auth?.confirmResetPassword)) {
    throw new Error("Auth.confirmResetPassword no está disponible.");
  }

  return Auth.confirmResetPassword(
    {
      token: payload.token,
      password: payload.password,
      confirmPassword: payload.confirmPassword,
    },
    {
      source: SOURCE,
    }
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

export function renderResetPasswordView(containerArg = null, deps = {}) {
  const container = isContainer(containerArg) ? containerArg : getContainer();

  if (!container) {
    return {
      ok: false,
      missingContainer: true,
    };
  }

  const options = isObject(deps) ? deps : {};
  const mode = currentMode();

  destroyPrevious(container);
  renderTemplate(container, mode, options);

  const refs = ensureTemplateShape(container, mode, options);
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

    const payload = mode === "confirm"
      ? readConfirmPayload(refs)
      : readRequestPayload(refs);

    const errors = mode === "confirm"
      ? validateConfirm(payload)
      : validateRequest(payload);

    if (Object.keys(errors).length) {
      applyErrors(refs, messageNode, errors);
      return false;
    }

    setSubmitting(true);

    emit("auth:password-reset:view:submit:start", {
      mode,
    });

    try {
      const result = mode === "confirm"
        ? await confirmReset(payload)
        : await requestReset(payload);

      if (!resultOk(result)) {
        throw result || new Error("PASSWORD_RESET_FAILED");
      }

      if (mode === "confirm") {
        setMessage(
          messageNode,
          resultMessage(result, "La contraseña se ha actualizado correctamente."),
          "success"
        );

        emit("auth:password-reset:view:submit:done", {
          mode,
          ok: true,
        });

        if (mounted && isPasswordResetRoute()) {
          await navigateTo(result?.redirectTo || LOGIN_ROUTE);
        }

        return true;
      }

      setMessage(
        messageNode,
        resultMessage(
          result,
          "Si el identificador existe, recibirás instrucciones para restablecer la contraseña."
        ),
        "success"
      );

      emit("auth:password-reset:view:submit:done", {
        mode,
        ok: true,
      });

      return true;
    } catch (error) {
      const message = errorMessage(
        error,
        mode === "confirm"
          ? "No se pudo restablecer la contraseña."
          : "No se pudo iniciar la recuperación de acceso."
      );

      setMessage(messageNode, message, "error");

      emit("auth:password-reset:view:error", {
        mode,
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

  for (const field of [refs.identifier, refs.password, refs.confirmPassword]) {
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

  try {
    (mode === "confirm" ? refs.password : refs.identifier)?.focus?.();
  } catch {
    // noop
  }

  hideLoader();

  emit("auth:password-reset:view:ready", {
    mode,
    route: currentCanonicalPath(),
  });

  const instance = {
    version: RESET_PASSWORD_VIEW_VERSION,

    mode,

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
      emit("auth:password-reset:view:destroyed", { mode });

      return true;
    },

    submit,

    getSnapshot() {
      return {
        version: RESET_PASSWORD_VIEW_VERSION,
        source: SOURCE,

        mounted,
        submitting,
        mode,

        route: currentCanonicalPath(),
        stillOnPasswordReset: isPasswordResetRoute(),

        hasToken: mode === "confirm" ? Boolean(getUrlToken()) : false,

        dom: {
          hasForm: Boolean(refs.form),
          hasIdentifier: Boolean(refs.identifier),
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
    version: RESET_PASSWORD_VIEW_VERSION,
    source: SOURCE,
    mounted: false,
    route: currentCanonicalPath(),
    mode: currentMode(),
    at: nowIso(),
  };
}

export const ResetPasswordView = {
  version: RESET_PASSWORD_VIEW_VERSION,

  init,
  render,
  mount,
  destroy,

  getSnapshot,
  getDebugSnapshot: getSnapshot,
};

export default ResetPasswordView;

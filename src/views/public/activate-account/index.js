/* =========================================================
   Onion Support - Activate Account View
   Archivo: /src/views/public/activate-account/index.js

   PRODUCTIVO · PUBLIC TOKEN FLOW · V1

   Responsabilidad:
   - Implementar la vista pública /activate-account.
   - Reutilizar el sistema visual productivo de password-reset.
   - Leer token desde ?token=... y compatibilidad /activate-account/<token>.
   - Mantener el token exclusivamente en memoria.
   - Validar contraseña antes de llamar Auth.
   - Llamar Auth.activateAccount() -> POST /api/auth/activate-account.
   - No crear sesión ni asumir usuario autenticado.
   - Mostrar estados de loading/error/success accesibles.
   - Navegar a /login tras activación correcta.
   - Tratar ACCOUNT_ALREADY_ACTIVE como estado recuperable hacia login.
   - Respetar AbortSignal del Router.
   - Limpiar listeners/timers al desmontar.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast directo.
   - Sin storage.
   - Sin persistir/loggear token/password.
========================================================= */

import { AppCore } from "../../../core/index.js";
import { Auth as DefaultAuth } from "../../../features/auth/index.js";
import {
  AUTH_PASSWORD_POLICY,
  AUTH_PASSWORD_POLICY_HELP,
  AUTH_PASSWORD_POLICY_MESSAGE,
  validateAuthPassword,
} from "../../../features/auth/password-policy.js";

import {
  ROUTES,
  TOKEN_PARAM,
} from "../../../core/config.js";

import createPasswordResetTemplate from "../password-reset/template.js";

export const ACTIVATE_ACCOUNT_VIEW_VERSION =
  "activate-account.view.public.v1-production";

/* =========================================================
   CONSTANTS
========================================================= */

const SOURCE = "activate-account.view";

const ACTIVATE_ROUTE =
  ROUTES.activateAccount ||
  "/activate-account";

const LOGIN_ROUTE =
  ROUTES.login ||
  "/login";

const PASSWORD_MIN_LENGTH = AUTH_PASSWORD_POLICY.minLength;
const PASSWORD_MAX_LENGTH = AUTH_PASSWORD_POLICY.maxLength;
const TOKEN_MAX_LENGTH = 4096;

const TOKEN_PARAM_NAMES = Object.freeze([
  TOKEN_PARAM,
  "token",
  "activation_token",
  "activationToken",
]);

const LEGACY_ACTIVATION_PREFIX =
  `${ACTIVATE_ROUTE.replace(/\/+$/g, "")}/`;

const INSTANCES = new WeakMap();
let lastInstance = null;

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isFunction(value) {
  return typeof value === "function";
}

function isObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value)
  );
}

function cleanText(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function normalizeCode(value = "") {
  return cleanText(value, "")
    .replace(/[\s-]+/g, "_")
    .toUpperCase();
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
    return true;
  } catch {
    try {
      node.focus?.();
      return true;
    } catch {
      return false;
    }
  }
}

function isAbortError(error = null) {
  return Boolean(
    error?.name === "AbortError" ||
    error?.code === "ABORT_ERR" ||
    error?.code === "ERR_ABORTED"
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

function safeFrontendRoute(value = "", fallback = LOGIN_ROUTE) {
  const raw = cleanText(value, "");

  if (!raw) return fallback;

  try {
    const base = isBrowser()
      ? window.location.origin
      : "https://onionsupport.local";

    const url = new URL(raw, base);

    if (isBrowser() && url.origin !== window.location.origin) {
      return fallback;
    }

    const path =
      `${url.pathname || "/"}${url.search || ""}${url.hash || ""}`;

    if (!path.startsWith("/")) return fallback;
    if (path.startsWith("//")) return fallback;
    if (/[\r\n\t\\]/.test(path)) return fallback;
    if (/^\/api(?:\/|$)/i.test(path)) return fallback;
    if (/^\/\.auth(?:\/|$)/i.test(path)) return fallback;
    if (
      /[?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(
        path
      )
    ) {
      return fallback;
    }

    return path;
  } catch {
    return (
      raw.startsWith("/") &&
      !raw.startsWith("//") &&
      !/[\r\n\t\\]/.test(raw)
    )
      ? raw
      : fallback;
  }
}

function resolveSuccessTarget(result = {}) {
  return safeFrontendRoute(
    result?.redirectTo ||
    result?.redirect_to ||
    result?.data?.redirectTo ||
    result?.data?.redirect_to ||
    LOGIN_ROUTE,
    LOGIN_ROUTE
  );
}

async function navigateWithRouter(
  target = LOGIN_ROUTE,
  context = {},
  options = {}
) {
  const router = getRouter(context);
  if (!router) return false;

  const route = safeFrontendRoute(target, LOGIN_ROUTE);

  const navigationOptions = {
    source: SOURCE,
    replaceState: true,
    ...options,
  };

  if (isFunction(router.replace)) {
    await router.replace(route, navigationOptions);
    return true;
  }

  if (isFunction(router.navigate)) {
    await router.navigate(route, navigationOptions);
    return true;
  }

  return false;
}

/* =========================================================
   PATH / TOKEN
========================================================= */

function browserPath() {
  if (!isBrowser()) return ACTIVATE_ROUTE;

  try {
    return `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`;
  } catch {
    return ACTIVATE_ROUTE;
  }
}

function pathFromContext(context = {}) {
  /*
    publicPath debe ganar porque conserva query/token y aliases de pathname.
  */
  return cleanText(
    context.publicPath ||
    context.path ||
    browserPath() ||
    context.canonicalPath ||
    context.route?.path,
    ACTIVATE_ROUTE
  );
}

function cleanToken(value = "") {
  const token = cleanText(value, "")
    .replace(/^Bearer\s+/i, "");

  if (!token) return "";
  if (/\s/.test(token)) return "";
  if (token.length > TOKEN_MAX_LENGTH) return "";

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

  for (const name of TOKEN_PARAM_NAMES) {
    try {
      const token = cleanToken(params.get(name) || "");
      if (token) return token;
    } catch {
      // continuar
    }
  }

  return "";
}

function tokenFromLegacyPathname(pathname = "") {
  const path = cleanText(pathname, "");
  if (!path) return "";

  const lowerPath = path.toLowerCase();
  const lowerPrefix = LEGACY_ACTIVATION_PREFIX.toLowerCase();

  if (!lowerPath.startsWith(lowerPrefix)) {
    return "";
  }

  const encoded = path.slice(LEGACY_ACTIVATION_PREFIX.length);

  /*
    El contrato esperado es un único segmento token.
    Rechazamos rutas con segmentos adicionales.
  */
  if (!encoded || encoded.includes("/")) {
    return "";
  }

  try {
    return cleanToken(decodeURIComponent(encoded));
  } catch {
    return cleanToken(encoded);
  }
}

function tokenFromPath(value = "") {
  const raw = cleanText(value, "");
  if (!raw) return "";

  try {
    const base = isBrowser()
      ? window.location.origin
      : "https://onionsupport.local";

    const url = new URL(raw, base);

    const fromSearch = tokenFromSearchParams(url.searchParams);
    if (fromSearch) return fromSearch;

    const hash = cleanText(url.hash.replace(/^#/, ""), "");

    if (hash && hash.includes("=")) {
      const fromHash = tokenFromSearchParams(
        new URLSearchParams(hash)
      );

      if (fromHash) return fromHash;
    }

    return tokenFromLegacyPathname(url.pathname);
  } catch {
    return "";
  }
}

/* =========================================================
   TEMPLATE ADAPTER
========================================================= */

function resolveTemplate(context = {}) {
  if (!isFunction(createPasswordResetTemplate)) {
    throw new Error(
      "[ActivateAccountView] password-reset/template.js no disponible."
    );
  }

  const token = tokenFromPath(
    pathFromContext(context)
  );

  const view = createPasswordResetTemplate({
    mode: "confirm",
    tokenPresent: Boolean(token),
  });

  if (!view || typeof view.querySelector !== "function") {
    throw new Error(
      "[ActivateAccountView] no se pudo construir el DOM público."
    );
  }

  /*
    Conservamos la clase password-reset para reutilizar el CSS productivo
    existente y añadimos identidad semántica propia de activación.
  */
  view.classList.add("public-auth-shell--activate-account");
  view.dataset.publicView = "activate-account";
  view.dataset.activateAccountViewVersion =
    ACTIVATE_ACCOUNT_VIEW_VERSION;
  view.setAttribute(
    "aria-labelledby",
    "activate-account-title"
  );

  const pro = view.querySelector(".password-reset-pro");
  const panel = view.querySelector(".password-reset-card-panel");
  const header = view.querySelector(".password-reset-card-header");
  const title = view.querySelector("#password-reset-title");
  const subtitle = view.querySelector(".password-reset-subtitle");
  const form = view.querySelector("[data-password-reset-form]");
  const submit = view.querySelector("[data-password-reset-submit]");
  const policy = view.querySelector("[data-password-reset-policy]");

  pro?.classList.add("activate-account-pro");
  panel?.classList.add("activate-account-card-panel");
  header?.classList.add("activate-account-card-header");

  if (title) {
    title.id = "activate-account-title";
    title.textContent = "Activar cuenta";
  }

  panel?.setAttribute(
    "aria-labelledby",
    "activate-account-title"
  );

  pro?.setAttribute(
    "aria-labelledby",
    "activate-account-title"
  );

  if (subtitle) {
    subtitle.textContent =
      "Crea una contraseña para terminar de activar tu usuario.";
  }

  if (form) {
    form.id = "activate-account-form";
    form.classList.add("activate-account-form");
    form.dataset.activateAccountForm = "true";
    form.removeAttribute("data-password-reset-flow");
    form.removeAttribute("data-reset-password-flow");
  }

  if (submit) {
    submit.classList.add("activate-account-submit");
    submit.dataset.activateAccountSubmit = "true";
    submit.dataset.defaultText = "Activar cuenta";
    submit.dataset.loadingText = "Activando...";
    submit.textContent = "Activar cuenta";
  }

  if (policy) {
    policy.classList.add("activate-account-password-policy");
    policy.dataset.activateAccountPolicy = "true";
    policy.textContent = AUTH_PASSWORD_POLICY_HELP;
  }

  const message = view.querySelector(
    "[data-password-reset-message]"
  );

  if (message) {
    message.classList.add("activate-account-message");
    message.dataset.activateAccountMessage = "true";
  }

  const tokenError = view.querySelector(
    "[data-password-reset-error-for='token']"
  );

  if (tokenError) {
    tokenError.classList.add("activate-account-token-error");
    tokenError.dataset.activateAccountErrorFor = "token";
  }

  const password = view.querySelector(
    "[data-password-reset-password]"
  );

  const confirmPassword = view.querySelector(
    "[data-password-reset-confirm]"
  );

  for (const input of [password, confirmPassword].filter(Boolean)) {
    input.setAttribute("minlength", String(PASSWORD_MIN_LENGTH));
    input.setAttribute("maxlength", String(PASSWORD_MAX_LENGTH));
  }

  password?.setAttribute(
    "data-activate-account-password",
    "true"
  );

  confirmPassword?.setAttribute(
    "data-activate-account-confirm",
    "true"
  );

  const back = view.querySelector(
    "[data-password-reset-back]"
  );

  if (back) {
    back.dataset.activateAccountBack = "true";
    back.textContent = "Volver al acceso";
  }

  return {
    view,
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

function getRefs(root = null) {
  if (!root) {
    throw new Error(
      "[ActivateAccountView] root inválido."
    );
  }

  const refs = {
    root,

    form:
      root.querySelector("[data-activate-account-form]") ||
      root.querySelector("[data-password-reset-form]"),

    message:
      root.querySelector("[data-activate-account-message]") ||
      root.querySelector("[data-password-reset-message]"),

    password:
      root.querySelector("[data-activate-account-password]") ||
      root.querySelector("[data-password-reset-password]") ||
      root.querySelector("[name='password']"),

    confirmPassword:
      root.querySelector("[data-activate-account-confirm]") ||
      root.querySelector("[data-password-reset-confirm]") ||
      root.querySelector("[name='confirmPassword']"),

    submit:
      root.querySelector("[data-activate-account-submit]") ||
      root.querySelector("[data-password-reset-submit]"),

    tokenError:
      root.querySelector("[data-activate-account-error-for='token']") ||
      root.querySelector("[data-password-reset-error-for='token']"),

    passwordError:
      root.querySelector("[data-password-reset-error-for='password']"),

    confirmPasswordError:
      root.querySelector("[data-password-reset-error-for='confirm-password']"),

    back:
      root.querySelector("[data-activate-account-back]") ||
      root.querySelector("[data-password-reset-back]"),

    toggles: [
      ...root.querySelectorAll("[data-password-toggle]"),
    ],

    caps: [
      ...root.querySelectorAll("[data-password-caps]"),
    ],
  };

  if (
    !refs.form ||
    !refs.password ||
    !refs.confirmPassword ||
    !refs.submit
  ) {
    throw new Error(
      "[ActivateAccountView] template incompleto."
    );
  }

  return refs;
}

/* =========================================================
   FIELD / MESSAGE STATE
========================================================= */

function errorNodeFor(refs, name = "") {
  if (name === "token") return refs.tokenError;
  if (name === "password") return refs.passwordError;
  if (name === "confirmPassword") return refs.confirmPasswordError;
  return null;
}

function inputFor(refs, name = "") {
  if (name === "password") return refs.password;
  if (name === "confirmPassword") return refs.confirmPassword;
  return null;
}

function clearFieldError(refs, name = "") {
  const node = errorNodeFor(refs, name);
  const input = inputFor(refs, name);

  if (node) {
    node.textContent = "";
    setHidden(node, true);
  }

  if (input) {
    input.setAttribute("aria-invalid", "false");
  }

  return true;
}

function setFieldError(refs, name = "", message = "") {
  const node = errorNodeFor(refs, name);
  const input = inputFor(refs, name);
  const text = cleanText(message, "");

  if (node) {
    node.textContent = text;
    setHidden(node, !text);
  }

  if (input) {
    input.setAttribute(
      "aria-invalid",
      text ? "true" : "false"
    );
  }

  return Boolean(text);
}

function clearMessage(refs) {
  const node = refs.message;
  if (!node) return false;

  node.textContent = "";
  node.classList.remove("is-success", "is-error");
  node.removeAttribute("data-message-type");
  setHidden(node, true);

  return true;
}

function setMessage(
  refs,
  message = "",
  type = "error"
) {
  const node = refs.message;
  if (!node) return false;

  const text = cleanText(message, "");
  const success = type === "success";

  node.textContent = text;
  node.classList.toggle("is-success", success);
  node.classList.toggle("is-error", !success && Boolean(text));

  if (text) {
    node.dataset.messageType = success
      ? "success"
      : "error";
  } else {
    node.removeAttribute("data-message-type");
  }

  setHidden(node, !text);
  return Boolean(text);
}

function clearErrors(refs, { keepToken = false } = {}) {
  clearMessage(refs);

  if (!keepToken) {
    clearFieldError(refs, "token");
  }

  clearFieldError(refs, "password");
  clearFieldError(refs, "confirmPassword");

  return true;
}

function applyErrors(refs, errors = {}) {
  let firstInvalid = null;

  for (const [name, message] of Object.entries(errors)) {
    setFieldError(refs, name, message);

    if (!firstInvalid) {
      firstInvalid = inputFor(refs, name);
    }
  }

  focusSafe(firstInvalid);
  return Object.keys(errors).length > 0;
}

/* =========================================================
   PASSWORD CONTROLS
========================================================= */

function getControlledInput(toggle = null, refs = null) {
  if (!toggle || !refs) return null;

  const id = cleanText(
    toggle.getAttribute("aria-controls") || "",
    ""
  );

  if (id) {
    try {
      const candidate = refs.root.querySelector(
        `#${CSS.escape(id)}`
      );

      if (candidate) return candidate;
    } catch {
      // fallback abajo
    }
  }

  const field = toggle.closest?.("[data-password-reset-field]");

  return (
    field?.querySelector?.("input[type='password'], input[type='text']") ||
    null
  );
}

function syncToggleVisual(toggle = null, visible = false) {
  if (!toggle) return false;

  try {
    toggle.setAttribute(
      "aria-pressed",
      visible ? "true" : "false"
    );

    toggle.setAttribute(
      "aria-label",
      visible
        ? "Ocultar contraseña"
        : "Mostrar contraseña"
    );

    const eye = toggle.querySelector(".password-eye-icon");
    const eyeOff = toggle.querySelector(".password-eye-off-icon");

    if (eye) setHidden(eye, visible);
    if (eyeOff) setHidden(eyeOff, !visible);

    return true;
  } catch {
    return false;
  }
}

function initPasswordControls(refs) {
  const cleanup = [];

  for (const toggle of refs.toggles) {
    const input = getControlledInput(toggle, refs);
    if (!input) continue;

    const onToggle = () => {
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      syncToggleVisual(toggle, visible);
      focusSafe(input);
    };

    toggle.addEventListener("click", onToggle);
    cleanup.push(() => toggle.removeEventListener("click", onToggle));
  }

  const passwordInputs = [
    refs.password,
    refs.confirmPassword,
  ].filter(Boolean);

  for (const input of passwordInputs) {
    const field = input.closest?.("[data-password-reset-field]");
    const caps = field?.querySelector?.("[data-password-caps]") || null;

    if (!caps) continue;

    const syncCaps = (event) => {
      let active = false;

      try {
        active = event.getModifierState?.("CapsLock") === true;
      } catch {
        active = false;
      }

      setHidden(caps, !active);
    };

    const hideCaps = () => setHidden(caps, true);

    input.addEventListener("keydown", syncCaps);
    input.addEventListener("keyup", syncCaps);
    input.addEventListener("blur", hideCaps);

    cleanup.push(() => input.removeEventListener("keydown", syncCaps));
    cleanup.push(() => input.removeEventListener("keyup", syncCaps));
    cleanup.push(() => input.removeEventListener("blur", hideCaps));
  }

  return {
    setDisabled(disabled = false) {
      const value = Boolean(disabled);

      for (const toggle of refs.toggles) {
        toggle.disabled = value;
      }

      return true;
    },

    destroy() {
      for (const dispose of cleanup.splice(0)) {
        try {
          dispose();
        } catch {
          // noop
        }
      }

      for (const caps of refs.caps) {
        setHidden(caps, true);
      }

      return true;
    },
  };
}

/* =========================================================
   FORM STATE / VALIDATION
========================================================= */

function setLoading(
  refs,
  loading = false,
  passwordControls = null
) {
  const value = Boolean(loading);

  refs.password.disabled = value;
  refs.confirmPassword.disabled = value;
  refs.submit.disabled = value;

  passwordControls?.setDisabled?.(value);

  const defaultText = cleanText(
    refs.submit.dataset.defaultText,
    "Activar cuenta"
  );

  const loadingText = cleanText(
    refs.submit.dataset.loadingText,
    "Activando..."
  );

  refs.submit.textContent = value
    ? loadingText
    : defaultText;

  refs.form.setAttribute(
    "aria-busy",
    value ? "true" : "false"
  );

  return true;
}

function lockCompletedForm(refs, passwordControls = null) {
  refs.password.disabled = true;
  refs.confirmPassword.disabled = true;
  refs.submit.disabled = true;
  passwordControls?.setDisabled?.(true);
  refs.form.setAttribute("aria-busy", "false");
  return true;
}

function readPayload(refs, token = "") {
  return {
    token: cleanToken(token),
    password: String(refs.password?.value ?? ""),
    confirmPassword: String(refs.confirmPassword?.value ?? ""),
  };
}

function validatePayload(payload = {}) {
  const errors = {};

  const token = cleanToken(payload.token || "");
  const password = String(payload.password ?? "");
  const confirmPassword = String(payload.confirmPassword ?? "");

  if (!token) {
    errors.token =
      "El enlace de activación no es válido o ha caducado.";
  }

  const passwordValidation = validateAuthPassword(password);
  if (!passwordValidation.ok) {
    errors.password = passwordValidation.message;
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Confirma la contraseña.";
  } else if (password && confirmPassword !== password) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }

  return errors;
}

function resultIsSuccess(result = {}) {
  return Boolean(
    result?.ok === true ||
    result?.success === true ||
    result?.activated === true ||
    normalizeCode(result?.code) === "ACCOUNT_ACTIVATED"
  );
}

function statusOf(error = null) {
  const value = Number(
    error?.status ||
    error?.statusCode ||
    error?.response?.status ||
    error?.data?.status ||
    error?.payload?.status ||
    0
  );

  return Number.isFinite(value)
    ? value
    : 0;
}

function codeOf(error = null) {
  return normalizeCode(
    error?.code ||
    error?.error ||
    error?.data?.code ||
    error?.data?.error ||
    error?.payload?.code ||
    error?.payload?.error ||
    error?.response?.code ||
    ""
  );
}

function activationError(error = null) {
  const code = codeOf(error);
  const status = statusOf(error);

  if (code === "TOKEN_EXPIRED") {
    return {
      field: "token",
      message: "El enlace de activación ha caducado.",
      completed: false,
    };
  }

  if (
    code === "TOKEN_INVALID_OR_EXPIRED" ||
    code === "ACTIVATION_STATE_CHANGED"
  ) {
    return {
      field: "token",
      message:
        code === "ACTIVATION_STATE_CHANGED"
          ? "El enlace de activación ya no es válido. Solicita uno nuevo."
          : "El enlace de activación no es válido o ha caducado.",
      completed: false,
    };
  }

  if (code === "ACCOUNT_ALREADY_ACTIVE") {
    return {
      field: "",
      message: "La cuenta ya está activada. Puedes iniciar sesión.",
      completed: true,
    };
  }

  if (code === "ACTIVATION_PASSWORD_MISSING") {
    return {
      field: "password",
      message: "Introduce una contraseña nueva.",
      completed: false,
    };
  }

  if (code === "WEAK_PASSWORD") {
    return {
      field: "password",
      message: AUTH_PASSWORD_POLICY_MESSAGE,
      completed: false,
    };
  }

  if (code === "PASSWORD_TOO_LONG") {
    return {
      field: "password",
      message: "La contraseña es demasiado larga.",
      completed: false,
    };
  }

  if (code === "ACTIVATION_PASSWORD_MISMATCH") {
    return {
      field: "confirmPassword",
      message: "Las contraseñas no coinciden.",
      completed: false,
    };
  }

  if (
    status === 429 ||
    code.includes("RATE_LIMIT")
  ) {
    return {
      field: "",
      message:
        "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.",
      completed: false,
    };
  }

  if (
    status >= 500 ||
    code === "ACTIVATION_UNAVAILABLE"
  ) {
    return {
      field: "",
      message:
        "No se pudo activar la cuenta en este momento. Inténtalo de nuevo.",
      completed: false,
    };
  }

  return {
    field: "",
    message: cleanText(
      error?.message ||
      error?.data?.message ||
      error?.payload?.message ||
      "",
      "No se pudo activar la cuenta."
    ),
    completed: false,
  };
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

export function renderActivateAccountView(
  container,
  context = {}
) {
  if (!isBrowser()) return null;

  if (!container) {
    throw new Error(
      "[ActivateAccountView] container requerido."
    );
  }

  destroyPrevious(container);

  const auth = getAuth(context);
  const resolved = mountTemplate(container, context);
  const view = resolved.view;

  /*
    token es closure privada. Nunca se copia a DOM/snapshot.
  */
  const token = resolved.token;

  const refs = getRefs(view);
  const passwordControls = initPasswordControls(refs);

  let mounted = true;
  let submitting = false;
  let completed = false;
  let redirectTimer = null;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setLoading(refs, submitting, passwordControls);
  }

  async function goToLogin(result = {}) {
    const target = resolveSuccessTarget(result);

    try {
      return await navigateWithRouter(
        target,
        context,
        {
          replaceState: true,
        }
      );
    } catch {
      return false;
    }
  }

  function scheduleLogin(result = {}) {
    if (redirectTimer) {
      clearTimeout(redirectTimer);
      redirectTimer = null;
    }

    redirectTimer = setTimeout(
      async () => {
        redirectTimer = null;

        if (!mounted) return;

        const navigated = await goToLogin(result);

        if (!mounted) return;

        if (!navigated) {
          setMessage(
            refs,
            "Cuenta activada correctamente. Pulsa «Volver al acceso» para iniciar sesión.",
            "success"
          );
        }
      },
      650
    );

    return true;
  }

  async function submit(event = null) {
    event?.preventDefault?.();

    if (
      !mounted ||
      submitting ||
      completed
    ) {
      return false;
    }

    clearErrors(refs, {
      keepToken: false,
    });

    const payload = readPayload(refs, token);
    const errors = validatePayload(payload);

    if (Object.keys(errors).length) {
      applyErrors(refs, errors);
      return false;
    }

    if (!isFunction(auth?.activateAccount)) {
      setMessage(
        refs,
        "No se pudo iniciar el proceso de activación.",
        "error"
      );
      return false;
    }

    setSubmitting(true);

    try {
      const result = await auth.activateAccount(
        {
          token: payload.token,
          password: payload.password,
          confirmPassword: payload.confirmPassword,
        },
        {
          source: SOURCE,
          signal: context.signal || undefined,
          public: true,
          noAutoRefresh: true,
          skipNavigation: true,
          skipRedirect: true,
          noRedirect: true,
        }
      );

      if (!mounted) return false;

      if (!resultIsSuccess(result)) {
        const error = new Error(
          cleanText(
            result?.message,
            "No se pudo activar la cuenta."
          )
        );

        error.status =
          result?.status ||
          result?.statusCode ||
          400;

        error.code =
          result?.code ||
          result?.error ||
          "ACTIVATION_FAILED";

        error.data = result;

        throw error;
      }

      completed = true;
      setSubmitting(false);
      lockCompletedForm(refs, passwordControls);

      refs.password.value = "";
      refs.confirmPassword.value = "";

      setMessage(
        refs,
        cleanText(
          result?.message,
          "Cuenta activada correctamente. Ya puedes iniciar sesión."
        ),
        "success"
      );

      scheduleLogin(result);
      return true;
    } catch (error) {
      if (!mounted || isAbortError(error)) {
        return false;
      }

      const mapped = activationError(error);

      if (mapped.completed) {
        completed = true;
        setSubmitting(false);
        lockCompletedForm(refs, passwordControls);

        refs.password.value = "";
        refs.confirmPassword.value = "";

        setMessage(
          refs,
          mapped.message,
          "success"
        );

        scheduleLogin({
          redirectTo: LOGIN_ROUTE,
        });

        return true;
      }

      if (mapped.field) {
        setFieldError(
          refs,
          mapped.field,
          mapped.message
        );

        focusSafe(
          inputFor(refs, mapped.field)
        );
      } else {
        setMessage(
          refs,
          mapped.message,
          "error"
        );
      }

      return false;
    } finally {
      if (
        mounted &&
        !completed
      ) {
        setSubmitting(false);
      }
    }
  }

  function onPasswordInput() {
    if (submitting || completed) return;

    clearMessage(refs);
    clearFieldError(refs, "password");

    if (
      refs.confirmPassword.value &&
      refs.confirmPassword.value === refs.password.value
    ) {
      clearFieldError(refs, "confirmPassword");
    }
  }

  function onConfirmInput() {
    if (submitting || completed) return;

    clearMessage(refs);
    clearFieldError(refs, "confirmPassword");
  }

  refs.form.addEventListener("submit", submit);
  refs.password.addEventListener("input", onPasswordInput);
  refs.confirmPassword.addEventListener("input", onConfirmInput);

  /*
    Si el token no está disponible, fallamos cerrado antes de tocar backend.
  */
  if (!token) {
    setFieldError(
      refs,
      "token",
      "El enlace de activación no es válido o ha caducado."
    );

    refs.password.disabled = true;
    refs.confirmPassword.disabled = true;
    refs.submit.disabled = true;
    passwordControls.setDisabled(true);
  } else {
    focusSafe(refs.password);
  }

  const instance = {
    version: ACTIVATE_ACCOUNT_VIEW_VERSION,
    root: view,
    submit,

    unlock() {
      if (completed || !token) return false;
      setSubmitting(false);
      return true;
    },

    destroy() {
      mounted = false;
      submitting = false;

      if (redirectTimer) {
        clearTimeout(redirectTimer);
        redirectTimer = null;
      }

      try {
        refs.form.removeEventListener("submit", submit);
        refs.password.removeEventListener("input", onPasswordInput);
        refs.confirmPassword.removeEventListener("input", onConfirmInput);
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

      /*
        Defensa en profundidad: no dejamos passwords en nodos desmontados.
      */
      try {
        refs.password.value = "";
        refs.confirmPassword.value = "";
      } catch {
        // noop
      }

      clearInstance(container, instance);
      return true;
    },

    getSnapshot() {
      return {
        version: ACTIVATE_ACCOUNT_VIEW_VERSION,
        mounted,
        submitting,
        completed,
        tokenPresent: Boolean(token),
        route: ACTIVATE_ROUTE,
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
  return renderActivateAccountView(container, context);
}

export function mount(container, context = {}) {
  return renderActivateAccountView(container, context);
}

export function destroy(options = {}) {
  try {
    return Boolean(
      lastInstance?.destroy?.(options)
    );
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
    mounted: false,
    submitting: false,
    completed: false,
    tokenPresent: false,
    route: ACTIVATE_ROUTE,
  };
}

export const getDebugSnapshot = getSnapshot;

export const ActivateAccountView = Object.assign(
  function ActivateAccountViewCompat(
    container,
    context = {}
  ) {
    return renderActivateAccountView(
      container,
      context
    );
  },
  {
    version: ACTIVATE_ACCOUNT_VIEW_VERSION,
    render: renderActivateAccountView,
    init,
    mount,
    destroy,
    getSnapshot,
    getDebugSnapshot,
  }
);

export {
  renderActivateAccountView as render,
};

export default ActivateAccountView;

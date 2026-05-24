/* =========================================================
   Onion Support - Activate Account View
   Archivo: /src/views/activate-account/index.js

   Responsabilidad:
   - Vista mínima de activación.
   - Ruta desde core/config.js.
   - Token param único desde core/config.js.
   - Pedir contraseña y confirmación.
   - Llamar Auth.activateAccount().
   - Mostrar mensaje en DOM.
   - Navegar a /login tras éxito usando Router.
   - Delegar password toggle en shared/password-field.
   - Sin fetch directo.
   - Sin CoreHttp directo.
   - Sin Toast.
   - Sin storage.
   - Sin loader propio.
   - Sin fallback template.
   - Sin eventos globales.
   - Sin navegación browser paralela.
   - Sin AppCore.navigate.
   - Sin token real en snapshot.
   - Sin 2FA/MFA/OTP.
   - Sin magia negra.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import {
  ROUTES,
  TOKEN_PARAM,
  USER_HOME_PREFIX,
  canonicalRoutePath as configCanonicalRoutePath,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import { bindPasswordFieldsInScope } from "../../shared/password-field/index.js";

import * as ActivateTemplate from "./activate-account.template.js";

export const ACTIVATE_ACCOUNT_VIEW_VERSION = "activate-account.view.v4";

const SOURCE = "activate-account.view";

const HOME_ROUTE = ROUTES.home || ROUTES.root || "/";
const ROUTE = ROUTES.activateAccount || "/activate-account";
const LOGIN_ROUTE = ROUTES.login || "/login";

const USER_PREFIX = USER_HOME_PREFIX || "/@";

const TOKEN_MIN_LENGTH = 8;
const TOKEN_MAX_LENGTH = 8192;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 1024;

const INSTANCES = new WeakMap();
const PASSWORD_BINDINGS = new WeakMap();

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

function isNode(value = null) {
  return Boolean(value && typeof value.nodeType === "number");
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function rawText(value = "", fallback = "") {
  return value === null || value === undefined ? fallback : String(value);
}

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function later(callback = null) {
  if (!isFunction(callback)) return false;

  const run = () => {
    try {
      callback();
    } catch {
      // noop
    }
  };

  try {
    queueMicrotask(run);
    return true;
  } catch {
    // fallback abajo
  }

  try {
    Promise.resolve().then(run).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

function safeRoot(root = null) {
  return isNode(root) ? root : isBrowser() ? document : null;
}

/* =========================================================
   PATH / TOKEN
========================================================= */

function normalizeSlug(value = "") {
  try {
    return configNormalizeUserSlug(value) || "";
  } catch {
    const slug = text(value, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/^\/+/, "")
      .replace(/^@+/, "")
      .split(/[/?#]/)[0]
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "")
      .toLowerCase();

    if (!slug) return "";

    return /^[a-z0-9][a-z0-9._-]{0,95}$/.test(slug) ? slug : "";
  }
}

function pathFromInput(path = HOME_ROUTE) {
  try {
    return configRoutePathFromUrlLike(path) || HOME_ROUTE;
  } catch {
    const raw = text(path, HOME_ROUTE);

    if (raw.startsWith("#!")) {
      return raw.replace(/^#!\/?/, "/") || HOME_ROUTE;
    }

    if (raw.startsWith("#/")) {
      return raw.slice(1) || HOME_ROUTE;
    }

    if (raw.startsWith("//")) return HOME_ROUTE;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return HOME_ROUTE;

    return raw || HOME_ROUTE;
  }
}

function normalizePathname(pathname = HOME_ROUTE) {
  try {
    return configNormalizeRoutePath(pathname) || HOME_ROUTE;
  } catch {
    let value = text(pathname, HOME_ROUTE)
      .split("#")[0]
      .split("?")[0]
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (!value.startsWith("/")) {
      value = `/${value}`;
    }

    if (value.length > 1) {
      value = value.replace(/\/+$/g, "") || HOME_ROUTE;
    }

    return value || HOME_ROUTE;
  }
}

function normalizeSearch(search = "") {
  const value = text(search, "");

  if (!value || value === "?") return "";

  return value.startsWith("?")
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(hash = "") {
  const value = text(hash, "");

  if (!value || value === "#") return "";

  return value.startsWith("#")
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitPath(path = HOME_ROUTE) {
  let raw = pathFromInput(path);
  let pathname = raw;
  let search = "";
  let hash = "";

  const hashIndex = pathname.indexOf("#");

  if (hashIndex >= 0) {
    hash = pathname.slice(hashIndex);
    pathname = pathname.slice(0, hashIndex) || HOME_ROUTE;
  }

  const searchIndex = pathname.indexOf("?");

  if (searchIndex >= 0) {
    search = pathname.slice(searchIndex);
    pathname = pathname.slice(0, searchIndex) || HOME_ROUTE;
  }

  return {
    pathname: normalizePathname(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinPath(parts = {}) {
  return [
    normalizePathname(parts.pathname || HOME_ROUTE),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
}

function getUserScopedInfo(pathname = HOME_ROUTE) {
  try {
    const info = configGetUserScopedRouteInfo(pathname);

    if (isObject(info)) {
      const restPath = normalizePathname(
        info.restPath ||
          info.canonicalPath ||
          pathname ||
          HOME_ROUTE
      );

      const canonicalPath = normalizePathname(
        info.canonicalPath ||
          info.lookupPath ||
          restPath ||
          HOME_ROUTE
      );

      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: normalizeSlug(info.slug || ""),
        restPath,
        canonicalPath,
        lookupPath: canonicalPath,
      };
    }
  } catch {
    // fallback abajo
  }

  const clean = normalizePathname(pathname);

  if (!clean.startsWith(USER_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: clean,
      canonicalPath: clean,
      lookupPath: clean,
    };
  }

  const rest = clean.slice(USER_PREFIX.length);
  const [slugSegment = "", ...segments] = rest.split("/");
  const slug = normalizeSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: clean,
      canonicalPath: clean,
      lookupPath: clean,
    };
  }

  const restPath = segments.length
    ? normalizePathname(`/${segments.join("/")}`)
    : HOME_ROUTE;

  return {
    scoped: true,
    home: restPath === HOME_ROUTE,
    slug,
    restPath,
    canonicalPath: restPath,
    lookupPath: restPath,
  };
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function fallbackBlockedPath(pathname = HOME_ROUTE) {
  const clean = normalizePathname(pathname).toLowerCase();

  return Boolean(
    clean === "/home" ||
      clean.startsWith("/home/") ||
      clean === "/403" ||
      clean.startsWith("/403/") ||
      clean === "/404" ||
      clean.startsWith("/404/") ||
      clean === "/2fa" ||
      clean.startsWith("/2fa/") ||
      clean === "/mfa" ||
      clean.startsWith("/mfa/") ||
      clean === "/otp" ||
      clean.startsWith("/otp/")
  );
}

function isBlockedPath(path = HOME_ROUTE) {
  try {
    if (configIsBlockedRoutePath(path) === true) return true;
  } catch {
    // fallback abajo
  }

  if (fallbackBlockedPath(path)) return true;

  const scoped = getUserScopedInfo(path);

  return Boolean(scoped.scoped && fallbackBlockedPath(scoped.restPath));
}

function normalizePublicPath(path = HOME_ROUTE) {
  const parts = splitPath(path);

  if (isBlockedPath(parts.pathname)) {
    return HOME_ROUTE;
  }

  return joinPath(parts);
}

function normalizeCanonicalPath(path = HOME_ROUTE) {
  if (isBlockedPath(path)) return HOME_ROUTE;

  try {
    const canonical = configCanonicalRoutePath(path) || HOME_ROUTE;
    return canonical ? normalizePathname(canonical) : HOME_ROUTE;
  } catch {
    const parts = splitPath(path);
    const scoped = getUserScopedInfo(parts.pathname);

    return scoped.scoped ? scoped.canonicalPath : parts.pathname;
  }
}

function currentPublicPath() {
  if (!isBrowser()) {
    return normalizePublicPath(
      AppCore?.state?.publicPath ||
        AppCore?.state?.canonicalPath ||
        AppCore?.state?.route ||
        ROUTE
    );
  }

  try {
    return normalizePublicPath(
      `${window.location.pathname || ROUTE}${window.location.search || ""}${window.location.hash || ""}`
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
  if (token.length < TOKEN_MIN_LENGTH) return "";
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

function tokenFromHash(hash = "") {
  const raw = text(hash, "").replace(/^#/, "");

  if (!raw) return "";

  if (raw.includes("?")) {
    return tokenFromQuery(raw.slice(raw.indexOf("?") + 1));
  }

  if (/^[^/?#=&]+=/i.test(raw)) {
    return tokenFromQuery(raw);
  }

  return "";
}

function tokenFromPath(path = "") {
  const raw = text(path, "");

  if (!raw) return "";

  const parts = splitPath(raw);

  return tokenFromQuery(parts.search) || tokenFromHash(parts.hash);
}

function getUrlToken() {
  if (!isBrowser()) {
    return tokenFromPath(AppCore?.state?.publicPath || "");
  }

  try {
    return tokenFromQuery(window.location.search) ||
      tokenFromHash(window.location.hash);
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
      !/[\r\n\t\\]/.test(value) &&
      !hasSensitiveQuery(value) &&
      !isBlockedPath(value) &&
      !getUserScopedInfo(value).scoped
  );
}

function safeInternalPath(path = "", fallback = LOGIN_ROUTE) {
  const fallbackPath = normalizePathname(fallback || LOGIN_ROUTE);
  const candidate = normalizePublicPath(path || fallbackPath);

  if (!isSafeInternalPath(candidate)) return fallbackPath;

  return candidate;
}

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

async function navigateTo(path = LOGIN_ROUTE) {
  const target = safeInternalPath(path, LOGIN_ROUTE);
  const router = getRouter();

  if (!router) return false;

  try {
    if (isFunction(router.replace)) {
      const result = await router.replace(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return result !== false && result?.ok !== false;
    }

    if (isFunction(router.navigate)) {
      const result = await router.navigate(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return result !== false && result?.ok !== false;
    }
  } catch {
    return false;
  }

  return false;
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

function setDataset(node = null, key = "", value = "") {
  if (!node || !key) return false;

  try {
    if (value === null || value === undefined || value === false || value === "") {
      delete node.dataset[key];
    } else {
      node.dataset[key] = String(value);
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

function setLinkDisabled(link = null, disabled = false) {
  if (!link) return false;

  const active = Boolean(disabled);

  setAttr(link, "aria-disabled", active ? "true" : null);

  try {
    link.classList.toggle("is-disabled", active);

    if (active) {
      if (!link.dataset.previousTabIndex) {
        link.dataset.previousTabIndex = String(link.tabIndex ?? "");
      }

      link.tabIndex = -1;
    } else {
      const previous = link.dataset.previousTabIndex;

      if (previous !== undefined && previous !== "") {
        link.tabIndex = Number(previous);
      } else {
        link.removeAttribute("tabindex");
      }

      delete link.dataset.previousTabIndex;
    }

    return true;
  } catch {
    return false;
  }
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
  node.setAttribute("aria-live", "assertive");
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

  const clean = redact(text(message, ""));
  const cleanType = ["error", "success", "info"].includes(type) ? type : "error";

  try {
    node.textContent = clean;
    setHidden(node, !clean);

    toggleClass(node, "is-visible", Boolean(clean));
    toggleClass(node, "is-error", Boolean(clean) && cleanType === "error");
    toggleClass(node, "is-success", Boolean(clean) && cleanType === "success");
    toggleClass(node, "is-info", Boolean(clean) && cleanType === "info");

    setAttr(node, "role", clean ? (cleanType === "error" ? "alert" : "status") : null);
    setAttr(node, "aria-live", clean ? (cleanType === "error" ? "assertive" : "polite") : null);
    setAttr(node, "aria-atomic", clean ? "true" : null);

    setDataset(node, "messageType", clean ? cleanType : "");

    return true;
  } catch {
    return false;
  }
}

function fieldWrapperFor(container = null, name = "") {
  if (!container || !name) return null;

  return (
    query(container, `[data-activate-account-field='${name}']`) ||
    query(container, `[data-activate-field='${name}']`) ||
    query(container, `[data-field='${name}']`) ||
    null
  );
}

function errorNodeFor(container = null, name = "") {
  if (!container || !name) return null;

  return (
    query(container, `[data-activate-account-error-for='${name}']`) ||
    query(container, `[data-activate-error-for='${name}']`) ||
    query(container, `[data-error-for='${name}']`) ||
    query(container, `#activateAccount${name.charAt(0).toUpperCase()}${name.slice(1)}Error`) ||
    null
  );
}

function setFieldError(input = null, field = null, errorNode = null, message = "") {
  const clean = redact(text(message, ""));

  toggleClass(field, "is-invalid", Boolean(clean));
  setDataset(field, "invalid", clean ? "true" : "");

  toggleClass(input, "is-invalid", Boolean(clean));
  setAttr(input, "aria-invalid", clean ? "true" : "false");

  if (errorNode) {
    try {
      errorNode.textContent = clean;
      setHidden(errorNode, !clean);
      toggleClass(errorNode, "is-visible", Boolean(clean));
      setAttr(errorNode, "role", clean ? "alert" : null);
      setAttr(errorNode, "aria-live", clean ? "polite" : null);
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   PASSWORD FIELD SHARED
========================================================= */

function disposeBinding(binding = null) {
  try {
    if (isFunction(binding)) binding();
    else if (isFunction(binding?.destroy)) binding.destroy();
    else if (isFunction(binding?.dispose)) binding.dispose();
    else if (isFunction(binding?.unbind)) binding.unbind();
    else if (isFunction(binding?.off)) binding.off();
  } catch {
    // noop
  }
}

function bindActivatePasswordFields(container = null, options = {}) {
  const root = safeRoot(container);

  if (!root) return [];

  const previous = PASSWORD_BINDINGS.get(root);

  if (previous && options.force !== true) {
    return previous;
  }

  if (previous) {
    for (const binding of previous) {
      disposeBinding(binding);
    }

    PASSWORD_BINDINGS.delete(root);
  }

  let bindings = [];

  try {
    const result = bindPasswordFieldsInScope(root);
    bindings = Array.isArray(result) ? result : result ? [result] : [];
  } catch {
    bindings = [];
  }

  PASSWORD_BINDINGS.set(root, bindings);

  return bindings;
}

function destroyActivatePasswordFields(container = null) {
  const root = safeRoot(container);

  if (!root) return false;

  const bindings = PASSWORD_BINDINGS.get(root) || [];

  for (const binding of bindings) {
    disposeBinding(binding);
  }

  PASSWORD_BINDINGS.delete(root);

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

  const token = normalizeToken(deps.token || getUrlToken());

  const html = renderer({
    ...(isObject(deps) ? deps : {}),

    appName: text(AppCore?.config?.appName, "Onion Support"),

    hasToken: Boolean(token),
    tokenCaptured: Boolean(token),
    token: "",
    tokenParam: TOKEN_PARAM,

    activateHref: ROUTE,
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

  const password =
    query(container, "[name='password']") ||
    query(container, "[data-activate-account-password]") ||
    query(container, "#activateAccountPassword") ||
    null;

  const confirmPassword =
    query(container, "[name='confirmPassword']") ||
    query(container, "[name='passwordConfirmation']") ||
    query(container, "[data-activate-account-confirm]") ||
    query(container, "#activateAccountPasswordConfirm") ||
    null;

  const submit =
    query(container, "[data-activate-account-submit]") ||
    query(container, "#activateAccountButton") ||
    query(container, "button[type='submit']") ||
    null;

  if (form) {
    try {
      form.noValidate = true;
      form.dataset.activateAccountViewVersion = ACTIVATE_ACCOUNT_VIEW_VERSION;
    } catch {
      // noop
    }
  }

  if (submit) {
    try {
      submit.type = "submit";

      if (!submit.dataset.defaultLabel) {
        submit.dataset.defaultLabel = text(submit.textContent, "Activar cuenta");
      }

      submit.setAttribute("aria-busy", "false");
    } catch {
      // noop
    }
  }

  return {
    form,

    password,
    confirmPassword,

    submit,
    back:
      query(container, "[data-activate-account-back]") ||
      query(container, ".activate-account-back-link") ||
      query(container, `a[href='${LOGIN_ROUTE}']`) ||
      null,

    fieldPassword: fieldWrapperFor(container, "password"),
    fieldConfirmPassword:
      fieldWrapperFor(container, "confirm-password") ||
      fieldWrapperFor(container, "confirmPassword"),

    passwordError: errorNodeFor(container, "password"),
    confirmPasswordError:
      errorNodeFor(container, "confirm-password") ||
      errorNodeFor(container, "confirmPassword"),

    passwordFieldBindings: [],
  };
}

function refsReady(refs = {}) {
  return Boolean(refs.form && refs.password && refs.confirmPassword && refs.submit);
}

function normalizePassword(value = "") {
  return rawText(value, "").slice(0, PASSWORD_MAX_LENGTH);
}

function readPayload(refs = {}, token = "") {
  return {
    token: normalizeToken(token),
    password: normalizePassword(refs.password?.value),
    confirmPassword: normalizePassword(refs.confirmPassword?.value),
  };
}

function validatePayload(payload = {}) {
  const errors = {};

  if (!normalizeToken(payload.token)) {
    errors.token = "El enlace de activación no es válido.";
  }

  if (!String(payload.password || "")) {
    errors.password = "Introduce una contraseña.";
  } else if (payload.password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  } else if (payload.password.length > PASSWORD_MAX_LENGTH) {
    errors.password = "La contraseña es demasiado larga.";
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

  setFieldError(refs.password, refs.fieldPassword, refs.passwordError, "");
  setFieldError(refs.confirmPassword, refs.fieldConfirmPassword, refs.confirmPasswordError, "");

  try {
    refs.form?.removeAttribute("data-error");
    refs.form?.removeAttribute("data-success");
  } catch {
    // noop
  }

  return true;
}

function applyErrors(refs = {}, messageNode = null, errors = {}) {
  setFieldError(refs.password, refs.fieldPassword, refs.passwordError, errors.password || "");
  setFieldError(
    refs.confirmPassword,
    refs.fieldConfirmPassword,
    refs.confirmPasswordError,
    errors.confirmPassword || ""
  );

  setMessage(messageNode, firstError(errors), "error");

  try {
    if (refs.form) {
      refs.form.dataset.error = "true";
      refs.form.removeAttribute("data-success");
    }
  } catch {
    // noop
  }

  const firstField =
    errors.password
      ? refs.password
      : errors.confirmPassword
        ? refs.confirmPassword
        : null;

  later(() => {
    try {
      firstField?.focus?.();
    } catch {
      // noop
    }
  });

  return true;
}

function setLoading(refs = {}, loading = false) {
  const active = Boolean(loading);

  setBusy(refs.form, active);

  setDataset(refs.form, "submitting", active ? "true" : "");

  setDisabled(refs.password, active);
  setDisabled(refs.confirmPassword, active);
  setDisabled(refs.submit, active);
  setLinkDisabled(refs.back, active);

  if (refs.submit) {
    try {
      refs.submit.textContent = active
        ? "Activando..."
        : text(refs.submit.dataset.defaultLabel, "Activar cuenta");

      setAttr(refs.submit, "aria-busy", active ? "true" : "false");
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

function errorPayload(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.responseData)) return error.responseData;
  if (isObject(error.response?.data)) return error.response.data;
  if (isObject(error.response) && !isFunction(error.response.blob)) return error.response;
  if (isObject(error) && !isFunction(error.blob)) return error;

  return {};
}

function errorMessage(error = null, fallback = "No se pudo activar la cuenta.") {
  const payload = errorPayload(error);

  return redact(
    text(payload.message, "") ||
      text(payload.error_description, "") ||
      text(payload.error, "") ||
      text(payload.detail, "") ||
      text(error?.message, "") ||
      fallback
  );
}

/* =========================================================
   INSTANCE
========================================================= */

function destroyPrevious(container = null) {
  const previous = INSTANCES.get(container);

  if (previous?.destroy) {
    previous.destroy({
      remount: true,
    });

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
  renderTemplate(container, {
    ...options,
    token,
  });

  const refs = getRefs(container);
  const messageNode = getMessageNode(container, refs.form);

  refs.passwordFieldBindings = bindActivatePasswordFields(container, {
    force: true,
  });

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

      try {
        refs.form?.setAttribute("data-success", "true");
        refs.form?.removeAttribute("data-error");
      } catch {
        // noop
      }

      if (mounted && isActivateRoute()) {
        await navigateTo(LOGIN_ROUTE);
      }

      return true;
    } catch (error) {
      setMessage(messageNode, errorMessage(error), "error");

      try {
        refs.form?.setAttribute("data-error", "true");
        refs.form?.removeAttribute("data-success");
      } catch {
        // noop
      }

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

      void navigateTo(LOGIN_ROUTE);
    }),
    () => destroyActivatePasswordFields(container),
  ];

  if (!token) {
    setMessage(
      messageNode,
      "No se ha encontrado un enlace de activación válido.",
      "error"
    );
  }

  later(() => {
    try {
      refs.password?.focus?.();
    } catch {
      // noop
    }
  });

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

        route: redact(currentPath()),
        stillOnActivate: isActivateRoute(),

        hasToken: Boolean(token),

        token: null,
        accessToken: null,
        refreshToken: null,

        dom: {
          hasForm: Boolean(refs.form),
          hasPassword: Boolean(refs.password),
          hasConfirmPassword: Boolean(refs.confirmPassword),
          hasSubmit: Boolean(refs.submit),
          hasMessage: Boolean(messageNode),
        },

        policy: {
          tokenParam: TOKEN_PARAM,
          tokenParamFromConfig: true,

          routesFromConfig: true,
          configOwnsBlockedRoutes: true,
          blocksLegacyRoutes: true,
          blocksSensitiveRedirects: true,

          noFetchDirect: true,
          noCoreHttpDirect: true,
          noToast: true,
          noStorage: true,
          noLoaderOwn: true,
          noEventsGlobal: true,

          noBrowserNavigation: true,
          noAppCoreNavigate: true,

          passwordFieldShared: true,

          noTokenInSnapshot: true,
          snapshotRedacted: true,

          no2fa: true,
          noMfa: true,
          noOtp: true,
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
    route: redact(currentPath()),
    hasToken: Boolean(getUrlToken()),
    token: null,
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

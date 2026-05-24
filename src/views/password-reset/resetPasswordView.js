/* =========================================================
   Onion Support - Password Reset View
   Archivo: /src/views/password-reset/resetPasswordView.js

   Responsabilidad:
   - Renderizar password-request / password-reset.
   - Delegar DOM en reset-password.dom.js.
   - Validar campos mínimos.
   - Leer token único desde core/config.js.
   - Llamar Auth.requestPasswordReset() / Auth.confirmResetPassword().
   - Redirigir a /login tras confirmación correcta usando Router.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast propio.
   - Sin bridge.
   - Sin loader propio.
   - Sin fallback template.
   - Sin navegación browser paralela.
   - Sin AppCore.navigate.
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

import { getResetPasswordTemplate } from "./reset-password.template.js";

import {
  getResetPasswordRefs,
  bindResetPasswordFields,
  destroyResetPasswordFields,
  clearResetPasswordErrors,
  applyResetPasswordErrors,
  setGlobalResetPasswordError,
  setResetPasswordLoading,
  setResetPasswordSuccessState,
  readResetPasswordFormState,
  focusResetPasswordPrimaryField,
  bindResetPasswordInputClearers,
  bindResetPasswordSubmit,
  bindResetPasswordBackLink,
} from "./reset-password.dom.js";

export const RESET_PASSWORD_VIEW_VERSION = "password-reset.view.v4";

const SOURCE = "password-reset.view";

const HOME_ROUTE = ROUTES.home || ROUTES.root || "/";
const PASSWORD_REQUEST_ROUTE = ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET_ROUTE = ROUTES.passwordReset || "/password-reset";
const LOGIN_ROUTE = ROUTES.login || "/login";

const USER_PREFIX = USER_HOME_PREFIX || "/@";

const TOKEN_MIN_LENGTH = 8;
const TOKEN_MAX_LENGTH = 8192;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 1024;

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

function isObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isContainer(value) {
  return Boolean(value && typeof value.querySelector === "function");
}

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***");
}

function errorPayload(error = null) {
  if (!error) return {};

  if (isObject(error.data)) return error.data;
  if (isObject(error.body)) return error.body;
  if (isObject(error.payload)) return error.payload;
  if (isObject(error.responseData)) return error.responseData;
  if (isObject(error.response?.data)) return error.response.data;
  if (isObject(error.response) && !isFn(error.response.blob)) return error.response;
  if (isObject(error) && !isFn(error.blob)) return error;

  return {};
}

/* =========================================================
   PATHS / TOKEN
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

function canonicalPath(path = HOME_ROUTE) {
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
        HOME_ROUTE
    );
  }

  try {
    return normalizePublicPath(
      `${window.location.pathname || HOME_ROUTE}${window.location.search || ""}${window.location.hash || ""}`
    );
  } catch {
    return HOME_ROUTE;
  }
}

function currentPath() {
  return canonicalPath(currentPublicPath());
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

function tokenFromUrl() {
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

function resolveMode(options = {}) {
  const mode = text(options.mode || options.flow, "").toLowerCase();

  if (options.isConfirm === true || mode === "confirm") return "confirm";
  if (mode === "request") return "request";

  const path = canonicalPath(
    options.canonicalPath ||
      options.path ||
      options.publicPath ||
      options.route?.path ||
      currentPath()
  );

  return path === PASSWORD_RESET_ROUTE ? "confirm" : "request";
}

/* =========================================================
   SPA NAVIGATION
========================================================= */

function safeInternalPath(value = "", fallback = LOGIN_ROUTE) {
  const fallbackPath = normalizePathname(fallback || LOGIN_ROUTE);
  const raw = text(value, fallbackPath);

  if (!raw.startsWith("/")) return fallbackPath;
  if (raw.startsWith("//")) return fallbackPath;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackPath;
  if (/[\r\n\t\\]/.test(raw)) return fallbackPath;
  if (hasSensitiveQuery(raw)) return fallbackPath;

  const normalized = normalizePublicPath(raw);
  const canonical = canonicalPath(normalized);

  if (isBlockedPath(normalized) || isBlockedPath(canonical)) return fallbackPath;
  if (getUserScopedInfo(normalized).scoped) return fallbackPath;

  return normalized || fallbackPath;
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
    if (isFn(router.replace)) {
      const result = await router.replace(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return result !== false && result?.ok !== false;
    }

    if (isFn(router.navigate)) {
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
   TEMPLATE
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

function renderTemplate(container, mode = "request", deps = {}) {
  const initialToken = mode === "confirm"
    ? normalizeToken(deps.token || tokenFromUrl())
    : "";

  const template = document.createElement("template");

  template.innerHTML = String(
    getResetPasswordTemplate({
      ...(isObject(deps) ? deps : {}),

      appName: text(AppCore?.config?.appName, "Onion Support"),

      backHref: LOGIN_ROUTE,
      loginHref: LOGIN_ROUTE,
      passwordRequestHref: PASSWORD_REQUEST_ROUTE,
      passwordResetHref: PASSWORD_RESET_ROUTE,

      mode,
      flow: mode,
      isConfirm: mode === "confirm",

      token: initialToken,
      tokenParam: TOKEN_PARAM,
    }) || ""
  );

  container.replaceChildren(template.content.cloneNode(true));

  return true;
}

/* =========================================================
   VALIDATION
========================================================= */

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
    errors.global = "El enlace de recuperación no es válido.";
  }

  const password = String(payload.password || "");
  const confirmPassword = String(payload.confirmPassword || "");

  if (!password) {
    errors.password = "Introduce la nueva contraseña.";
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password = "La contraseña es demasiado larga.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Confirma la nueva contraseña.";
  }

  if (password && confirmPassword && password !== confirmPassword) {
    errors.confirmPassword = "Las contraseñas no coinciden.";
  }

  return errors;
}

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
      result?.description,
    fallback
  );
}

function errorMessage(error = null, fallback = "No se pudo completar la operación.") {
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
   AUTH ACTIONS
========================================================= */

async function requestReset(payload = {}) {
  if (!isFn(Auth?.requestPasswordReset)) {
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
  if (!isFn(Auth?.confirmResetPassword)) {
    throw new Error("Auth.confirmResetPassword no está disponible.");
  }

  return Auth.confirmResetPassword(
    {
      token: normalizeToken(payload.token),
      password: String(payload.password || "").slice(0, PASSWORD_MAX_LENGTH),
      confirmPassword: String(payload.confirmPassword || "").slice(0, PASSWORD_MAX_LENGTH),
    },
    {
      source: SOURCE,
      skipNavigation: true,
      skipRedirect: true,
      noRedirect: true,
    }
  );
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

export function renderResetPasswordView(containerArg = null, deps = {}) {
  const container = isContainer(containerArg) ? containerArg : getContainer();

  if (!container) {
    return {
      ok: false,
      missingContainer: true,
    };
  }

  const options = isObject(deps) ? deps : {};
  const mode = resolveMode(options);

  const initialToken = mode === "confirm"
    ? normalizeToken(options.token || tokenFromUrl())
    : "";

  destroyPrevious(container);

  renderTemplate(container, mode, {
    ...options,
    token: initialToken,
  });

  const refs = getResetPasswordRefs(container);

  refs.passwordFieldBindings = bindResetPasswordFields(refs.root || container, {
    force: true,
  });

  let mounted = true;
  let submitting = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setResetPasswordLoading(refs, submitting);
  }

  async function submit(event = null) {
    try {
      event?.preventDefault?.();
    } catch {
      // noop
    }

    if (!mounted || submitting) return false;

    clearResetPasswordErrors(refs);

    const payload = readResetPasswordFormState(refs);

    if (mode === "confirm") {
      payload.token = normalizeToken(payload.token || initialToken || tokenFromUrl());
    }

    const errors = mode === "confirm"
      ? validateConfirm(payload)
      : validateRequest(payload);

    if (Object.keys(errors).length) {
      applyResetPasswordErrors(refs, errors);
      return false;
    }

    setSubmitting(true);

    try {
      const result = mode === "confirm"
        ? await confirmReset(payload)
        : await requestReset(payload);

      if (!resultOk(result)) {
        throw result || new Error("PASSWORD_RESET_FAILED");
      }

      if (mode === "confirm") {
        setResetPasswordSuccessState(refs, {
          message: resultMessage(result, "Contraseña actualizada correctamente."),
        });

        const navigated = await navigateTo(LOGIN_ROUTE);

        if (!navigated) {
          throw new Error("No se pudo volver a la pantalla de acceso.");
        }

        return true;
      }

      setResetPasswordSuccessState(refs, {
        message: resultMessage(
          result,
          "Si el identificador existe, recibirás instrucciones para restablecer la contraseña."
        ),
      });

      return true;
    } catch (error) {
      setGlobalResetPasswordError(
        refs,
        errorMessage(
          error,
          mode === "confirm"
            ? "No se pudo restablecer la contraseña."
            : "No se pudo iniciar la recuperación de acceso."
        )
      );

      return false;
    } finally {
      if (mounted) {
        setSubmitting(false);
      }
    }
  }

  const disposers = [
    bindResetPasswordSubmit(refs, submit),
    bindResetPasswordInputClearers(refs, () => clearResetPasswordErrors(refs)),
    bindResetPasswordBackLink(refs, (event) => {
      try {
        event?.preventDefault?.();
      } catch {
        // noop
      }

      void navigateTo(LOGIN_ROUTE);
    }),
    () => destroyResetPasswordFields(refs.root || container),
  ];

  focusResetPasswordPrimaryField(refs);

  const instance = {
    version: RESET_PASSWORD_VIEW_VERSION,
    mode,

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
        setResetPasswordLoading(refs, false);
      } catch {
        // noop
      }

      clearInstance(container, instance);

      return true;
    },

    getSnapshot() {
      return {
        version: RESET_PASSWORD_VIEW_VERSION,
        mounted,
        submitting,
        mode,

        route: redact(currentPath()),
        hasToken: mode === "confirm" ? Boolean(initialToken || tokenFromUrl()) : false,

        token: null,
        accessToken: null,
        refreshToken: null,

        policy: {
          viewOnly: true,
          delegatesDom: true,
          delegatesAuth: true,
          routerNavigationOnly: true,

          noHttpDirect: true,
          noStore: true,
          noToastOwn: true,
          noLoaderOwn: true,

          tokenParam: TOKEN_PARAM,
          tokenParamUnique: true,

          routesFromConfig: true,
          configOwnsBlockedRoutes: true,
          blocksLegacyRoutes: true,
          blocksSensitiveRedirects: true,

          noBrowserNavigation: true,
          noAppCoreNavigate: true,

          no2fa: true,
          noMfa: true,
          noOtp: true,

          snapshotRedacted: true,
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
    version: RESET_PASSWORD_VIEW_VERSION,
    mounted: false,
    route: redact(currentPath()),
    mode: resolveMode(),
  };
}

export const getDebugSnapshot = getSnapshot;

export const ResetPasswordView = Object.assign(
  function ResetPasswordViewCompat(container, deps = {}) {
    return renderResetPasswordView(container, deps);
  },
  {
    version: RESET_PASSWORD_VIEW_VERSION,
    render: renderResetPasswordView,
    init,
    mount,
    destroy,
    getSnapshot,
    getDebugSnapshot,
  }
);

export { renderResetPasswordView as renderView };

export default ResetPasswordView;

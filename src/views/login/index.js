/* =========================================================
   Onion Support - Login View
   Archivo: /src/views/login/index.js

   Responsabilidad:
   - Renderizar login.
   - Delegar DOM en login.dom.js.
   - Validar campos mínimos.
   - Llamar Auth.login().
   - Navegar vía Router a /@{user.slug} tras login correcto.
   - Rutas/base/path helpers desde core/config.js.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast directo.
   - Sin 2FA/MFA/OTP.
   - Sin eventos globales.
   - Sin loader propio.
   - Sin navegación browser paralela.
   - Sin AppCore.navigate.
   - Sin magia negra.
   - Sin /home.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import {
  PUBLIC_ROUTES,
  ROUTES,
  USER_HOME_PREFIX,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isPublicRoute as configIsPublicRoute,
  isUserHomeRoute as configIsUserHomeRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import getLoginTemplate from "./login.template.js";

import {
  getLoginRefs,
  bindLoginPasswordFields,
  destroyLoginPasswordFields,
  clearLoginErrors,
  applyLoginErrors,
  setGlobalLoginError,
  setLoginLoading,
  focusLoginPrimaryField,
  readLoginFormState,
  bindLoginInputClearers,
  bindLoginSubmit,
} from "./login.dom.js";

export const LOGIN_VIEW_VERSION = "login.view.v6";

const SOURCE = "login.view";

const HOME_ROUTE = "/";
const LOGIN_ROUTE = ROUTES.login || "/login";
const PASSWORD_REQUEST_ROUTE = ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET_ROUTE = ROUTES.passwordReset || "/password-reset";
const ACTIVATE_ACCOUNT_ROUTE = ROUTES.activateAccount || "/activate-account";

const USER_PREFIX = USER_HOME_PREFIX || "/@";

const FALLBACK_BLOCKED_PATHS = new Set([
  "/home",
  "/403",
  "/404",
  "/2fa",
  "/mfa",
  "/otp",
]);

const PUBLIC_AUTH_ROUTES = new Set(
  (
    Array.isArray(PUBLIC_ROUTES) && PUBLIC_ROUTES.length
      ? [...PUBLIC_ROUTES]
      : [
          LOGIN_ROUTE,
          PASSWORD_REQUEST_ROUTE,
          PASSWORD_RESET_ROUTE,
          ACTIVATE_ACCOUNT_ROUTE,
        ]
  )
    .map(cleanPath)
    .filter(Boolean)
);

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

  return {};
}

/* =========================================================
   PATHS
========================================================= */

function pathFromInput(value = HOME_ROUTE) {
  try {
    return configRoutePathFromUrlLike(value) || HOME_ROUTE;
  } catch {
    return HOME_ROUTE;
  }
}

function cleanPath(value = HOME_ROUTE) {
  try {
    return configNormalizeRoutePath(pathFromInput(value)) || HOME_ROUTE;
  } catch {
    let path = text(value, HOME_ROUTE)
      .split("?")[0]
      .split("#")[0];

    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    path = path
      .replace(/\\/g, "/")
      .replace(/\/{2,}/g, "/");

    if (path.length > 1) {
      path = path.replace(/\/+$/g, "") || HOME_ROUTE;
    }

    return path || HOME_ROUTE;
  }
}

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

function getUserScopedPathInfo(value = HOME_ROUTE) {
  const path = cleanPath(value);

  if (!path.startsWith(USER_PREFIX)) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: path,
    };
  }

  const rest = path.slice(USER_PREFIX.length);
  const [slugSegment = "", ...restSegments] = rest.split("/");
  const slug = normalizeSlug(slugSegment);

  if (!slug) {
    return {
      scoped: false,
      home: false,
      slug: "",
      restPath: path,
    };
  }

  const restPath = restSegments.length
    ? cleanPath(`/${restSegments.join("/")}`)
    : HOME_ROUTE;

  return {
    scoped: true,
    home: restPath === HOME_ROUTE,
    slug,
    restPath,
  };
}

function hasSensitiveQuery(value = "") {
  return /[?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=/i.test(
    String(value || "")
  );
}

function isLocallyBlockedPath(value = "") {
  const path = cleanPath(value).toLowerCase();

  if (FALLBACK_BLOCKED_PATHS.has(path)) return true;

  return (
    path.startsWith("/home/") ||
    path.startsWith("/403/") ||
    path.startsWith("/404/") ||
    path.startsWith("/2fa/") ||
    path.startsWith("/mfa/") ||
    path.startsWith("/otp/")
  );
}

function isBlockedLegacyPath(value = "") {
  try {
    if (configIsBlockedRoutePath(value) === true) return true;
  } catch {
    // fallback abajo
  }

  if (isLocallyBlockedPath(value)) return true;

  const scoped = getUserScopedPathInfo(value);

  return Boolean(scoped.scoped && isLocallyBlockedPath(scoped.restPath));
}

function isUserHomePath(value = "") {
  try {
    return configIsUserHomeRoute(value) === true;
  } catch {
    return Boolean(getUserScopedPathInfo(value).home);
  }
}

function safeInternalPath(value = "", fallback = HOME_ROUTE) {
  const raw = text(value, fallback);

  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallback;
  if (/[\r\n\t\\]/.test(raw)) return fallback;
  if (hasSensitiveQuery(raw)) return fallback;
  if (isBlockedLegacyPath(raw)) return fallback;

  const normalized = cleanPath(raw);

  return normalized || fallback;
}

function isPublicAuthPath(value = "") {
  const path = cleanPath(value);

  if (getUserScopedPathInfo(path).scoped) return false;

  try {
    if (configIsPublicRoute(path) === true) return true;
  } catch {
    // fallback abajo
  }

  return PUBLIC_AUTH_ROUTES.has(path);
}

/* =========================================================
   NAVIGATION
========================================================= */

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

function authHomeTarget(result = {}) {
  const target = safeInternalPath(
    result?.postLoginTarget ||
      result?.homePath ||
      result?.defaultHome ||
      result?.redirectTo ||
      Auth?.getPostLoginTarget?.() ||
      Auth?.getDefaultHome?.() ||
      AppCore?.state?.postLoginTarget ||
      AppCore?.state?.homePath ||
      AppCore?.state?.defaultHome ||
      HOME_ROUTE,
    HOME_ROUTE
  );

  if (isPublicAuthPath(target)) {
    return HOME_ROUTE;
  }

  /*
    Si Auth ya resolvió /@slug, lo respetamos.
    Si sólo tenemos "/", Router real se encargará de canonicalizar
    a /@{slug} cuando la sesión esté aplicada.
  */
  return isUserHomePath(target) ? cleanPath(target) : target;
}

async function goAfterLogin(result = {}) {
  const target = authHomeTarget(result);
  const router = getRouter();

  if (!router) return false;

  try {
    if (isFn(router.goAfterLogin)) {
      const output = await router.goAfterLogin(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return output !== false && output?.ok !== false;
    }

    if (isFn(router.replace)) {
      const output = await router.replace(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return output !== false && output?.ok !== false;
    }

    if (isFn(router.navigate)) {
      const output = await router.navigate(target, {
        source: SOURCE,
        replaceState: true,
        force: true,
      });

      return output !== false && output?.ok !== false;
    }
  } catch {
    return false;
  }

  return false;
}

/* =========================================================
   TEMPLATE
========================================================= */

function renderTemplate(container, deps = {}) {
  const template = document.createElement("template");

  template.innerHTML = String(
    getLoginTemplate({
      ...(isObject(deps) ? deps : {}),

      appName: text(AppCore?.config?.appName, "Onion Support"),

      loginHref: LOGIN_ROUTE,
      passwordRequestHref: PASSWORD_REQUEST_ROUTE,
      forgotPasswordHref: PASSWORD_REQUEST_ROUTE,
      passwordResetHref: PASSWORD_RESET_ROUTE,
      activateAccountHref: ACTIVATE_ACCOUNT_ROUTE,
    }) || ""
  );

  container.replaceChildren(template.content.cloneNode(true));

  return true;
}

/* =========================================================
   VALIDATION
========================================================= */

function validate(payload = {}) {
  const errors = {};

  if (!text(payload.identifier, "")) {
    errors.identifier = "Introduce tu usuario o email.";
  }

  if (!String(payload.password || "")) {
    errors.password = "Introduce tu contraseña.";
  }

  return errors;
}

function authenticated(result = {}) {
  if (result?.authenticated === true) return true;

  try {
    return Auth.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

function errorMessage(error = null) {
  const payload = errorPayload(error);

  return redact(
    text(payload.message, "") ||
      text(payload.error_description, "") ||
      text(payload.error, "") ||
      text(payload.detail, "") ||
      text(error?.message, "") ||
      "No se pudo iniciar sesión."
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

export function renderLoginView(container, deps = {}) {
  if (!isBrowser()) return null;

  if (!container) {
    throw new Error("[LoginView] container requerido.");
  }

  destroyPrevious(container);
  renderTemplate(container, deps);

  const refs = getLoginRefs(container);

  refs.passwordFieldBindings = bindLoginPasswordFields(refs.root || container, {
    force: true,
  });

  let mounted = true;
  let submitting = false;

  function setSubmitting(value = false) {
    submitting = Boolean(value);
    setLoginLoading(refs, submitting);
  }

  async function submit(event = null) {
    try {
      event?.preventDefault?.();
    } catch {
      // noop
    }

    if (!mounted || submitting) return false;

    clearLoginErrors(refs);

    const payload = readLoginFormState(refs);
    const errors = validate(payload);

    if (Object.keys(errors).length) {
      applyLoginErrors(refs, errors);
      return false;
    }

    setSubmitting(true);

    try {
      const result = await Auth.login(
        {
          identifier: payload.identifier,
          password: payload.password,
          remember: payload.remember,
        },
        {
          source: SOURCE,
          skipNavigation: true,
          skipRedirect: true,
          noRedirect: true,
        }
      );

      if (!authenticated(result)) {
        throw new Error(result?.message || "Login inválido.");
      }

      const navigated = await goAfterLogin(result);

      if (!navigated) {
        throw new Error("No se pudo completar la navegación tras el login.");
      }

      return true;
    } catch (error) {
      setGlobalLoginError(refs, errorMessage(error));
      return false;
    } finally {
      if (mounted) {
        setSubmitting(false);
      }
    }
  }

  const disposers = [
    bindLoginSubmit(refs, submit),
    bindLoginInputClearers(refs, () => clearLoginErrors(refs)),
    () => destroyLoginPasswordFields(refs.root || container),
  ];

  focusLoginPrimaryField(refs);

  const instance = {
    version: LOGIN_VIEW_VERSION,

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
        setLoginLoading(refs, false);
      } catch {
        // noop
      }

      clearInstance(container, instance);

      return true;
    },

    getSnapshot() {
      const isAuth = authenticated();

      return {
        version: LOGIN_VIEW_VERSION,
        mounted,
        submitting,
        authenticated: isAuth,
        target: isAuth ? redact(authHomeTarget()) : null,
        policy: {
          viewOnly: true,
          delegatesDom: true,
          authLoginOnly: true,
          routerNavigationOnly: true,

          configOwnsRoutes: true,
          configOwnsBlockedRoutes: true,
          configOwnsUserHomeRoute: true,

          noHttpDirect: true,
          noStore: true,
          noToastDirect: true,
          noBrowserNavigation: true,
          noAppCoreNavigate: true,

          blocksLegacyRoutes: true,
          blocksSensitiveRedirects: true,
          publicRoutesCannotLiveUnderUserScope: true,

          noHomeRoute: true,
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
   COMPAT EXPORTS
========================================================= */

export function init(container, deps = {}) {
  return renderLoginView(container, deps);
}

export function mount(container, deps = {}) {
  return renderLoginView(container, deps);
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
    authenticated: authenticated(),
  };
}

export const getDebugSnapshot = getSnapshot;

export const LoginView = Object.assign(
  function LoginViewCompat(container, deps = {}) {
    return renderLoginView(container, deps);
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

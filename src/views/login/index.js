/* =========================================================
   Onion Support - Login View
   Archivo: /src/views/login/index.js

   Responsabilidad:
   - Renderizar login.
   - Delegar DOM en login.dom.js.
   - Delegar validación/payload/error en login.helpers.js.
   - Llamar Auth.login().
   - Navegar vía Router tras login correcto.
   - Rutas/base/path helpers desde core/config.js.
   - Home visible autenticada: /@{user.slug}.
   - Home interna/canónica: /.
   - Sin HTTP directo.
   - Sin Store.
   - Sin Toast directo.
   - Sin aplicar sesión manualmente.
   - Sin storage propio.
   - Sin eventos globales.
   - Sin loader propio.
   - Sin navegación browser paralela.
   - Sin AppCore.navigate.
   - Sin denylist local.
   - Sin opción "Recordarme".
   - Sin /home.
   - Sin /403.
   - Sin /404.
   - Sin 2FA/MFA/OTP.
========================================================= */

import { AppCore } from "../../core/index.js";
import { Auth } from "../../features/auth/index.js";

import {
  PUBLIC_ROUTES,
  ROUTES,
  USER_HOME_PREFIX,
  buildUserHomeRoute as configBuildUserHomeRoute,
  getUserScopedRouteInfo as configGetUserScopedRouteInfo,
  isBlockedRoutePath as configIsBlockedRoutePath,
  isPublicRoute as configIsPublicRoute,
  isUserHomeRoute as configIsUserHomeRoute,
  normalizeRoutePath as configNormalizeRoutePath,
  normalizeUserSlug as configNormalizeUserSlug,
  routePathFromUrlLike as configRoutePathFromUrlLike,
} from "../../core/config.js";

import getLoginTemplate from "./login.template.js";

import {
  createLoginPayload,
  getFirstLoginError,
  normalizeAuthResult,
  resolveAuthErrorMessage,
  validateLoginPayload,
} from "./login.helpers.js";

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

export const LOGIN_VIEW_VERSION = "login.view.v8";

const SOURCE = "login.view";

const HOME_ROUTE = "/";
const LOGIN_ROUTE = ROUTES.login || "/login";
const PASSWORD_REQUEST_ROUTE = ROUTES.passwordRequest || "/password-request";
const PASSWORD_RESET_ROUTE = ROUTES.passwordReset || "/password-reset";
const ACTIVATE_ACCOUNT_ROUTE = ROUTES.activateAccount || "/activate-account";

const USER_PREFIX = USER_HOME_PREFIX || "/@";

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

function firstText(...values) {
  for (const value of values) {
    const output = text(value, "");

    if (output) return output;
  }

  return "";
}

function redact(value = "") {
  return text(value, "")
    .replace(
      /([?&#](?:access_token|refresh_token|id_token|token|code|secret|session|password|pwd|key|sig|signature|jwt|authorization|reset_token|activation_token)=)([^&#\s]+)/gi,
      "$1***"
    )
    .replace(/(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi, "$1***")
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "***");
}

/* =========================================================
   PATHS
========================================================= */

function pathFromInput(value = HOME_ROUTE) {
  try {
    return configRoutePathFromUrlLike(value) || HOME_ROUTE;
  } catch {
    const raw = text(value, HOME_ROUTE);

    if (!raw) return HOME_ROUTE;
    if (raw.startsWith("#!")) return raw.replace(/^#!\/?/, "/") || HOME_ROUTE;
    if (raw.startsWith("#/")) return raw.slice(1) || HOME_ROUTE;
    if (raw.startsWith("//")) return HOME_ROUTE;
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return HOME_ROUTE;
    if (/[\r\n\t\\]/.test(raw)) return HOME_ROUTE;

    return raw;
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

function splitPath(value = HOME_ROUTE) {
  let raw = pathFromInput(value);
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
    pathname: cleanPath(pathname),
    search: normalizeSearch(search),
    hash: normalizeHash(hash),
  };
}

function joinPath(parts = {}) {
  return [
    cleanPath(parts.pathname || HOME_ROUTE),
    normalizeSearch(parts.search || ""),
    normalizeHash(parts.hash || ""),
  ].join("");
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
  try {
    const info = configGetUserScopedRouteInfo(value);

    if (isObject(info)) {
      return {
        scoped: Boolean(info.scoped),
        home: Boolean(info.home),
        slug: normalizeSlug(info.slug || ""),
        restPath: cleanPath(info.restPath || info.canonicalPath || HOME_ROUTE),
      };
    }
  } catch {
    // fallback abajo
  }

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

function isBlockedLoginPath(value = "") {
  try {
    if (configIsBlockedRoutePath(value) === true) return true;
  } catch {
    // noop
  }

  const parts = splitPath(value);

  try {
    if (configIsBlockedRoutePath(parts.pathname) === true) return true;
  } catch {
    // noop
  }

  const scoped = getUserScopedPathInfo(parts.pathname);

  if (scoped.scoped && scoped.restPath) {
    try {
      return configIsBlockedRoutePath(scoped.restPath) === true;
    } catch {
      return false;
    }
  }

  return false;
}

function isUserHomePath(value = "") {
  try {
    return configIsUserHomeRoute(value) === true;
  } catch {
    return Boolean(getUserScopedPathInfo(value).home);
  }
}

function normalizePublicPath(value = HOME_ROUTE, fallback = HOME_ROUTE) {
  const fallbackPath = fallback === ""
    ? ""
    : joinPath(splitPath(fallback || HOME_ROUTE));

  const raw = text(value, fallbackPath || HOME_ROUTE);

  if (!raw && fallback === "") return "";
  if (!raw.startsWith("/")) return fallbackPath || HOME_ROUTE;
  if (raw.startsWith("//")) return fallbackPath || HOME_ROUTE;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return fallbackPath || HOME_ROUTE;
  if (/[\r\n\t\\]/.test(raw)) return fallbackPath || HOME_ROUTE;
  if (hasSensitiveQuery(raw)) return fallbackPath || HOME_ROUTE;
  if (isBlockedLoginPath(raw)) return fallbackPath || HOME_ROUTE;

  const normalized = joinPath(splitPath(raw));

  if (!normalized || isBlockedLoginPath(normalized)) {
    return fallbackPath || HOME_ROUTE;
  }

  return normalized;
}

function safeInternalPath(value = "", fallback = HOME_ROUTE) {
  return normalizePublicPath(value, fallback);
}

function isPublicAuthPath(value = "") {
  const path = cleanPath(value);

  if (!path) return false;
  if (getUserScopedPathInfo(path).scoped) return false;
  if (isBlockedLoginPath(path)) return false;

  try {
    if (configIsPublicRoute(path) === true) return true;
  } catch {
    // fallback abajo
  }

  return PUBLIC_AUTH_ROUTES.has(path);
}

/* =========================================================
   AUTH / ROUTER
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

function authResultUserSlug(result = {}) {
  const normalized = normalizeAuthResult(result);

  const explicit = firstText(
    result?.userSlug,
    result?.slug,
    normalized?.user?.slug,
    normalized?.user?.lookup?.slug,
    normalized?.user?.profile?.slug,
    normalized?.user?.routing?.slug,
    Auth?.getUserSlug?.(),
    Auth?.extractUserSlug?.(normalized?.user || result?.user || null)
  );

  return normalizeSlug(explicit);
}

function buildUserHomePathFromResult(result = {}) {
  const slug = authResultUserSlug(result);

  if (!slug) return HOME_ROUTE;

  try {
    const home = configBuildUserHomeRoute(slug);
    return safeInternalPath(home, HOME_ROUTE);
  } catch {
    return `${USER_PREFIX}${slug}`;
  }
}

function authHomeTarget(result = {}) {
  const explicitTarget = firstText(
    result?.postLoginTarget,
    result?.homePath,
    result?.defaultHome,
    result?.redirectTo,
    Auth?.getPostLoginTarget?.(),
    Auth?.getDefaultHome?.(),
    AppCore?.state?.postLoginTarget,
    AppCore?.state?.homePath,
    AppCore?.state?.defaultHome
  );

  let target = safeInternalPath(explicitTarget, HOME_ROUTE);

  if (isPublicAuthPath(target)) {
    target = HOME_ROUTE;
  }

  /*
    Si Auth ya resolvió /@slug, se respeta.
    Si sólo tenemos "/", construimos /@{slug} si hay slug real.
    Si no hay slug, Router decidirá el fallback canónico.
  */
  if (target === HOME_ROUTE && !isUserHomePath(target)) {
    const home = buildUserHomePathFromResult(result);

    if (home && home !== HOME_ROUTE) {
      return home;
    }
  }

  return target;
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
   VALIDATION / AUTH
========================================================= */

function validate(payload = {}) {
  return validateLoginPayload(payload);
}

function authenticated(result = {}) {
  if (result?.authenticated === true) return true;

  const normalized = normalizeAuthResult(result);

  if (normalized.authenticated === true) return true;

  try {
    return Auth.isAuthenticated?.() === true;
  } catch {
    return false;
  }
}

function errorMessage(error = null) {
  return resolveAuthErrorMessage(error);
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

    const formState = readLoginFormState(refs);
    const payload = createLoginPayload(formState);
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
        },
        {
          source: SOURCE,
          skipNavigation: true,
          skipRedirect: true,
          noRedirect: true,
        }
      );

      if (!authenticated(result)) {
        const normalized = normalizeAuthResult(result);
        throw new Error(
          normalized.message ||
            getFirstLoginError({
              message: "Login inválido.",
            }) ||
            "Login inválido."
        );
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
          delegatesValidationToHelpers: true,

          authLoginOnly: true,
          authOwnsSessionApply: true,
          routerNavigationOnly: true,

          configOwnsRoutes: true,
          configOwnsBlockedRoutes: true,
          configOwnsUserHomeRoute: true,

          noHttpDirect: true,
          noStore: true,
          noToastDirect: true,
          noStorageOwn: true,
          noBrowserNavigation: true,
          noAppCoreNavigate: true,
          noSessionApply: true,
          noEvents: true,
          noRememberOption: true,

          blocksRoutesViaCoreConfig: true,
          blocksSensitiveRedirects: true,
          publicRoutesCannotLiveUnderUserScope: true,

          homeInternalPath: HOME_ROUTE,
          homeVisiblePattern: `${USER_PREFIX}{user.slug}`,

          noHomeRoute: true,
          no403Route: true,
          no404Route: true,
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

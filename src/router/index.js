/* =========================================================
   Onion Support - Router
   Archivo: /src/router/index.js

   Responsabilidad:
   - Router SPA mínimo.
   - Resolver rutas públicas/privadas/admin.
   - Resolver /@{slug} y /@{slug}/{ruta}.
   - Resolver aliases legacy declarados en routes.js.
   - Mantener /password-reset?token=... como token route pública.
   - Compatibilidad segura con /activate-account/<token> sin persistir el token.
   - Permitir que la vista reciba el token sólo en memoria.
   - NO copiar tokens a AppCore.state, history.state ni data-* del DOM.
   - Validar slug real del usuario autenticado.
   - Respetar la URL actual tras restore de sesión.
   - Cancelar transiciones obsoletas y evitar commits tardíos.
   - Renderizar vista con swap atómico.
   - Actualizar history.
   - Actualizar shell/chrome básico.
   - Sin Auth propio.
   - Sin HTTP/fetch.
   - Sin Store.
   - Sin Toast.
   - Sin storage.
========================================================= */

import { AppCore } from "../core/index.js";

import {
  ROUTES,
  USER_HOME_PREFIX,
  SENSITIVE_QUERY_PARAMS,
  buildUserHomeRoute,
  buildUserScopedRoute,
  getUserScopedRouteInfo,
  isBlockedRoutePath,
  normalizeRoutePath,
  normalizeUserSlug,
  routePathFromUrlLike,
} from "../core/config.js";

import * as Routes from "./routes.js";
import RouteStyles from "./styles.js";
import {
  ensurePrivateRuntimeUI,
  destroyPrivateRuntimeUI,
} from "../features/private-runtime-ui/index.js";

export const ROUTER_VERSION =
  "router.minimal.v16-private-runtime-after-guard";

const PUBLIC_HOME_PATH = "/";

const PRIVATE_HOME_PATH =
  Routes.ROUTE_PATHS?.HOME ||
  ROUTES.privateHome ||
  ROUTES.dashboard ||
  "/dashboard";

const HOME_PATH =
  PUBLIC_HOME_PATH;

const LOGIN_PATH =
  ROUTES.login ||
  "/login";

const APP_TITLE =
  "Onion Support";

const ROUTE_HOST_CLASS =
  "route-view-host";

const ROUTER_EVENT_HANDLED_KEY =
  "__onionRouterHandled";

const LEGACY_RESET_TOKEN_PATH =
  /^\/(?:reset-password|password-reset)\/confirm\/([^/?#]+)(?:\/)?$/i;

const LEGACY_RESET_TOKEN_REDACT =
  /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;

const LEGACY_ACTIVATION_TOKEN_PATH =
  /^\/activate-account\/([^/?#]+)(?:\/)?$/i;

const LEGACY_ACTIVATION_TOKEN_REDACT =
  /(\/activate-account\/)([^/?#\s]+)/gi;

const DEFAULT_SENSITIVE_QUERY_PARAMS =
  [
    "access_token",
    "accessToken",
    "refresh_token",
    "refreshToken",
    "id_token",
    "idToken",
    "token",
    "code",
    "secret",
    "session",
    "sessionId",
    "session_id",
    "password",
    "pwd",
    "key",
    "sig",
    "signature",
    "jwt",
    "authorization",
    "reset_token",
    "resetToken",
    "activation_token",
    "activationToken",
  ];

const SENSITIVE_QUERY_KEYS =
  new Set(
    [
      ...(
        Array.isArray(
          SENSITIVE_QUERY_PARAMS
        )
          ? SENSITIVE_QUERY_PARAMS
          : []
      ),
      ...DEFAULT_SENSITIVE_QUERY_PARAMS,
    ]
      .map(
        (key) =>
          normalizeKey(key)
      )
      .filter(Boolean)
  );

let initialized = false;
let bound = false;

let activeView = null;
let activeHost = null;

let renderSeq = 0;
let renderTask = null;

let pendingSeq = 0;
let pendingPath = "";

let activeTransition = null;
let runtimePerformanceModule = null;

const disposers = [];

/* =========================================================
   BASICS
========================================================= */

function isBrowser() {
  return (
    typeof window !== "undefined" &&
    typeof document !== "undefined"
  );
}

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return (
    typeof value ===
    "function"
  );
}

function cleanText(
  value = "",
  fallback = ""
) {
  const output =
    String(value ?? "")
      .replace(
        /[\r\n\t]/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  return (
    output ||
    fallback
  );
}

function normalizeKey(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .replace(
      /[-_\s]/g,
      ""
    )
    .toLowerCase();
}

function redactLegacyResetToken(
  value = ""
) {
  return String(
    value ?? ""
  )
    .replace(
      LEGACY_RESET_TOKEN_REDACT,
      "$1***"
    )
    .replace(
      LEGACY_ACTIVATION_TOKEN_REDACT,
      "$1***"
    );
}

function redact(
  value = ""
) {
  return redactLegacyResetToken(
    cleanText(
      value,
      ""
    )
      .replace(
        /([?&#](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=)([^&#\s]+)/gi,
        "$1***"
      )
      .replace(
        /(Bearer\s+)([A-Za-z0-9._~+/=-]+)/gi,
        "$1***"
      )
      .replace(
        /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        "***"
      )
  );
}

function getRoutes() {
  return isFunction(
    Routes.getImmutableRoutes
  )
    ? Routes.getImmutableRoutes()
    : [];
}

function readState() {
  try {
    if (
      isFunction(
        AppCore?.runtimeState?.read
      )
    ) {
      return (
        AppCore.runtimeState.read() ||
        {}
      );
    }
  } catch {
    // noop
  }

  return {};
}

function writeState(
  patch = {}
) {
  try {
    if (
      isFunction(
        AppCore?.runtimeState?.write
      )
    ) {
      AppCore.runtimeState.write(
        patch
      );

      return true;
    }
  } catch {
    // noop
  }

  /*
    No mutamos AppCore.state directamente.
    Core es la única autoridad de escritura del estado global.
  */
  return false;
}

function performanceNow() {
  try {
    return Number(
      performance.now()
    ) || 0;
  } catch {
    return 0;
  }
}

function cleanPerformanceKey(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .replace(
      /[^a-z0-9._:-]/gi,
      ""
    )
    .slice(0, 96);
}

function getRuntimePerformanceModule() {
  if (
    isFunction(
      runtimePerformanceModule
        ?.recordRoutePhase
    )
  ) {
    return runtimePerformanceModule;
  }

  try {
    const candidate =
      AppCore.getModule?.(
        "runtimePerformance"
      ) ||
      AppCore.runtimePerformance ||
      null;

    if (
      isFunction(
        candidate?.recordRoutePhase
      )
    ) {
      runtimePerformanceModule =
        candidate;

      return candidate;
    }
  } catch {
    // noop
  }

  return null;
}

function setTransitionPerformanceView(
  transition = null,
  route = null
) {
  if (!transition) {
    return "";
  }

  transition.performanceViewKey =
    cleanPerformanceKey(
      route?.viewKey ||
      route?.name ||
      ""
    );

  return transition.performanceViewKey;
}

function recordTransitionPhase(
  transition = null,
  route = null,
  phase = "",
  startTime = 0,
  endTime = performanceNow()
) {
  const module =
    getRuntimePerformanceModule();

  const navigationId =
    cleanPerformanceKey(
      transition?.performanceId
    );

  const viewKey =
    cleanPerformanceKey(
      transition?.performanceViewKey ||
      route?.viewKey ||
      route?.name ||
      ""
    );

  const safePhase =
    cleanPerformanceKey(
      phase
    ).toLowerCase();

  if (
    !module ||
    !navigationId ||
    !viewKey ||
    !safePhase
  ) {
    return false;
  }

  try {
    return (
      module.recordRoutePhase({
        navigationId,
        viewKey,
        phase:
          safePhase,
        startTime:
          Number(startTime),
        endTime:
          Number(endTime),
      }) === true
    );
  } catch {
    return false;
  }
}

/* =========================================================
   IDEMPOTENT DOM HELPERS
========================================================= */

function setAttributeIfChanged(
  element = null,
  name = "",
  value = ""
) {
  if (
    !element ||
    !name
  ) {
    return false;
  }

  const next =
    String(value);

  if (
    element.getAttribute(
      name
    ) === next
  ) {
    return false;
  }

  element.setAttribute(
    name,
    next
  );

  return true;
}

function setDatasetIfChanged(
  element = null,
  key = "",
  value = ""
) {
  if (
    !element?.dataset ||
    !key
  ) {
    return false;
  }

  const next =
    String(value);

  if (
    element.dataset[key] ===
    next
  ) {
    return false;
  }

  element.dataset[key] =
    next;

  return true;
}

function setClassState(
  element = null,
  className = "",
  enabled = false
) {
  if (
    !element?.classList ||
    !className
  ) {
    return false;
  }

  const next =
    enabled === true;

  if (
    element.classList.contains(
      className
    ) === next
  ) {
    return false;
  }

  element.classList.toggle(
    className,
    next
  );

  return true;
}

/* =========================================================
   PATHS
========================================================= */

function routePathFromInput(
  value = HOME_PATH
) {
  try {
    return (
      routePathFromUrlLike(
        value
      ) ||
      HOME_PATH
    );
  } catch {
    const raw =
      cleanText(
        value,
        HOME_PATH
      );

    if (!raw) {
      return HOME_PATH;
    }

    if (
      raw.startsWith(
        "#!"
      )
    ) {
      return (
        raw.replace(
          /^#!\/?/,
          "/"
        ) ||
        HOME_PATH
      );
    }

    if (
      raw.startsWith(
        "#/"
      )
    ) {
      return (
        raw.slice(1) ||
        HOME_PATH
      );
    }

    if (
      raw.startsWith(
        "//"
      )
    ) {
      return HOME_PATH;
    }

    if (
      /^[a-z][a-z0-9+.-]*:/i.test(
        raw
      ) &&
      !/^https?:\/\//i.test(
        raw
      )
    ) {
      return HOME_PATH;
    }

    if (
      /[\r\n\t\\]/.test(
        raw
      )
    ) {
      return HOME_PATH;
    }

    if (
      /^https?:\/\//i.test(
        raw
      ) &&
      isBrowser()
    ) {
      try {
        const url =
          new URL(raw);

        if (
          url.origin !==
          window.location.origin
        ) {
          return HOME_PATH;
        }

        return (
          `${url.pathname || HOME_PATH}${url.search || ""}${url.hash || ""}`
        );
      } catch {
        return HOME_PATH;
      }
    }

    return raw;
  }
}

function normalizePathname(
  pathname = HOME_PATH
) {
  try {
    return (
      normalizeRoutePath(
        pathname
      ) ||
      HOME_PATH
    );
  } catch {
    let value =
      cleanText(
        pathname,
        HOME_PATH
      )
        .split("?")[0]
        .split("#")[0]
        .replace(
          /\\/g,
          "/"
        );

    if (
      !value.startsWith(
        "/"
      )
    ) {
      value =
        `/${value}`;
    }

    value =
      value.replace(
        /\/{2,}/g,
        "/"
      );

    if (
      value.length > 1
    ) {
      value =
        value.replace(
          /\/+$/g,
          ""
        ) ||
        HOME_PATH;
    }

    return (
      value ||
      HOME_PATH
    );
  }
}

function normalizeSearch(
  search = ""
) {
  const value =
    cleanText(
      search,
      ""
    );

  if (
    !value ||
    value === "?"
  ) {
    return "";
  }

  return value.startsWith(
    "?"
  )
    ? value
    : `?${value.replace(/^\?+/, "")}`;
}

function normalizeHash(
  hash = ""
) {
  const value =
    cleanText(
      hash,
      ""
    );

  if (
    !value ||
    value === "#"
  ) {
    return "";
  }

  return value.startsWith(
    "#"
  )
    ? value
    : `#${value.replace(/^#+/, "")}`;
}

function splitPath(
  path = HOME_PATH
) {
  let pathname =
    routePathFromInput(
      path
    );

  let search = "";
  let hash = "";

  const hashIndex =
    pathname.indexOf(
      "#"
    );

  if (
    hashIndex >= 0
  ) {
    hash =
      pathname.slice(
        hashIndex
      );

    pathname =
      pathname.slice(
        0,
        hashIndex
      ) ||
      HOME_PATH;
  }

  const searchIndex =
    pathname.indexOf(
      "?"
    );

  if (
    searchIndex >= 0
  ) {
    search =
      pathname.slice(
        searchIndex
      );

    pathname =
      pathname.slice(
        0,
        searchIndex
      ) ||
      HOME_PATH;
  }

  return {
    pathname:
      normalizePathname(
        pathname
      ),

    search:
      normalizeSearch(
        search
      ),

    hash:
      normalizeHash(
        hash
      ),
  };
}

function joinPath(
  parts = {}
) {
  return (
    `${normalizePathname(parts.pathname || HOME_PATH)}` +
    `${normalizeSearch(parts.search || "")}` +
    `${normalizeHash(parts.hash || "")}`
  );
}

function normalizePublicPath(
  path = HOME_PATH
) {
  return joinPath(
    splitPath(path)
  );
}

function browserPath() {
  if (!isBrowser()) {
    return HOME_PATH;
  }

  const hash =
    window.location.hash ||
    "";

  if (
    hash.startsWith(
      "#/"
    ) ||
    hash.startsWith(
      "#!"
    )
  ) {
    return normalizePublicPath(
      hash
    );
  }

  return normalizePublicPath(
    `${window.location.pathname || HOME_PATH}${window.location.search || ""}${hash}`
  );
}

function currentPublicPath() {
  /*
    En navegador la URL es la fuente de verdad.
    AppCore.state sólo conserva una copia sanitizada.
  */
  if (isBrowser()) {
    return browserPath();
  }

  return normalizePublicPath(
    readState().publicPath ||
    HOME_PATH
  );
}

function currentCanonicalPath() {
  const state =
    readState();

  return normalizePathname(
    state.canonicalPath ||
    state.route ||
    HOME_PATH
  );
}

function publicPathname(
  path = HOME_PATH
) {
  return (
    splitPath(path)
      .pathname
  );
}

function withSearchHashFrom(
  sourcePath = HOME_PATH,
  targetPathname = HOME_PATH
) {
  const parts =
    splitPath(
      sourcePath
    );

  return joinPath({
    pathname:
      targetPathname,

    search:
      parts.search,

    hash:
      parts.hash,
  });
}

function isLegacyResetTokenPath(
  path = HOME_PATH
) {
  const pathname =
    publicPathname(
      path
    );

  return Boolean(
    LEGACY_RESET_TOKEN_PATH.test(
      pathname
    ) ||
    LEGACY_ACTIVATION_TOKEN_PATH.test(
      pathname
    )
  );
}

function sensitivePathCanonical(
  path = HOME_PATH
) {
  const pathname =
    publicPathname(
      path
    );

  if (
    LEGACY_RESET_TOKEN_PATH.test(
      pathname
    )
  ) {
    return (
      ROUTES.passwordReset ||
      "/password-reset"
    );
  }

  if (
    LEGACY_ACTIVATION_TOKEN_PATH.test(
      pathname
    )
  ) {
    return (
      ROUTES.activateAccount ||
      "/activate-account"
    );
  }

  return "";
}

function canonicalLookupPath(
  pathname = HOME_PATH
) {
  try {
    if (
      isFunction(
        Routes.resolveRouteLookupPath
      )
    ) {
      const resolved =
        Routes.resolveRouteLookupPath(
          pathname
        );

      if (resolved) {
        return normalizePathname(
          resolved
        );
      }
    }
  } catch {
    // fallback abajo
  }

  return normalizePathname(
    pathname
  );
}

function getScopedInfo(
  path = HOME_PATH
) {
  try {
    return getUserScopedRouteInfo(
      path
    );
  } catch {
    const clean =
      normalizePathname(
        path
      );

    if (
      !clean.startsWith(
        USER_HOME_PREFIX
      )
    ) {
      return {
        scoped: false,
        home: false,
        slug: "",
        restPath:
          clean,
        canonicalPath:
          clean,
        lookupPath:
          clean,
      };
    }

    const rest =
      clean.slice(
        USER_HOME_PREFIX.length
      );

    const [
      slugSegment = "",
      ...segments
    ] =
      rest.split("/");

    const slug =
      normalizeUserSlug(
        slugSegment
      );

    if (!slug) {
      return {
        scoped: false,
        home: false,
        slug: "",
        restPath:
          clean,
        canonicalPath:
          clean,
        lookupPath:
          clean,
      };
    }

    const restPath =
      segments.length
        ? normalizePathname(
            `/${segments.join("/")}`
          )
        : HOME_PATH;

    return {
      scoped: true,

      home:
        restPath ===
        HOME_PATH,

      slug,

      restPath,

      canonicalPath:
        restPath,

      lookupPath:
        restPath,
    };
  }
}

function canonicalPathFromPublicPath(
  path = HOME_PATH
) {
  const pathname =
    publicPathname(
      path
    );

  const resolved =
    canonicalLookupPath(
      pathname
    );

  if (resolved) {
    return resolved;
  }

  const scoped =
    getScopedInfo(
      pathname
    );

  if (
    scoped.scoped
  ) {
    return normalizePathname(
      scoped.home
        ? PRIVATE_HOME_PATH
        : (
            scoped.canonicalPath ||
            scoped.restPath ||
            HOME_PATH
          )
    );
  }

  return normalizePathname(
    pathname
  );
}

/* =========================================================
   SENSITIVE PATHS
========================================================= */

function queryHasSensitiveKey(
  search = ""
) {
  const value =
    normalizeSearch(
      search
    );

  if (!value) {
    return false;
  }

  try {
    const params =
      new URLSearchParams(
        value
      );

    for (
      const key
      of params.keys()
    ) {
      if (
        SENSITIVE_QUERY_KEYS.has(
          normalizeKey(
            key
          )
        )
      ) {
        return true;
      }
    }
  } catch {
    return (
      /[?&](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(
        value
      )
    );
  }

  return false;
}

function hashHasSensitiveValue(
  hash = ""
) {
  const value =
    normalizeHash(
      hash
    );

  if (!value) {
    return false;
  }

  return (
    /[#&?](?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|token|code|secret|session|sessionId|session_id|password|pwd|key|sig|signature|jwt|authorization|reset_token|resetToken|activation_token|activationToken)=/i.test(
      value
    )
  );
}

function hasSensitiveQuery(
  path = ""
) {
  const parts =
    splitPath(
      path
    );

  return Boolean(
    queryHasSensitiveKey(
      parts.search
    ) ||
    hashHasSensitiveValue(
      parts.hash
    )
  );
}

function stripSensitiveQuery(
  path = HOME_PATH
) {
  const parts =
    splitPath(
      path
    );

  const params =
    new URLSearchParams(
      parts.search ||
      ""
    );

  for (
    const key
    of [
      ...params.keys(),
    ]
  ) {
    if (
      SENSITIVE_QUERY_KEYS.has(
        normalizeKey(
          key
        )
      )
    ) {
      params.delete(
        key
      );
    }
  }

  return joinPath({
    pathname:
      parts.pathname,

    search:
      params.toString()
        ? `?${params.toString()}`
        : "",

    hash:
      hashHasSensitiveValue(
        parts.hash
      )
        ? ""
        : parts.hash,
  });
}

function stateSafePublicPath(
  matchOrPath = HOME_PATH
) {
  const match =
    isObject(
      matchOrPath
    )
      ? matchOrPath
      : null;

  const publicPath =
    normalizePublicPath(
      match
        ?.publicPath ||
      matchOrPath ||
      HOME_PATH
    );

  const sensitiveCanonical =
    sensitivePathCanonical(
      publicPath
    );

  if (
    sensitiveCanonical
  ) {
    return normalizePathname(
      sensitiveCanonical
    );
  }

  if (
    hasSensitiveQuery(
      publicPath
    )
  ) {
    return stripSensitiveQuery(
      publicPath
    );
  }

  return publicPath;
}

/* =========================================================
   HREF / BLOCK POLICY
========================================================= */

function isUnsafeHref(
  href = ""
) {
  const value =
    cleanText(
      href,
      ""
    );

  return Boolean(
    !value ||
    value.startsWith(
      "//"
    ) ||
    (
      /^[a-z][a-z0-9+.-]*:/i.test(
        value
      ) &&
      !/^https?:\/\//i.test(
        value
      )
    ) ||
    /[\r\n\t\\]/.test(
      value
    )
  );
}

function isExternalHref(
  href = ""
) {
  if (!isBrowser()) {
    return false;
  }

  const value =
    cleanText(
      href,
      ""
    );

  if (
    !/^https?:\/\//i.test(
      value
    )
  ) {
    return false;
  }

  try {
    return (
      new URL(
        value,
        window.location.origin
      ).origin !==
      window.location.origin
    );
  } catch {
    return true;
  }
}

function isHashOnlyHref(
  href = ""
) {
  const value =
    cleanText(
      href,
      ""
    );

  return (
    value.startsWith(
      "#"
    ) &&
    !value.startsWith(
      "#/"
    ) &&
    !value.startsWith(
      "#!"
    )
  );
}

function isBlockedPath(
  path = HOME_PATH
) {
  const parts =
    splitPath(
      path
    );

  try {
    if (
      isBlockedRoutePath(
        parts.pathname
      )
    ) {
      return true;
    }
  } catch {
    // noop
  }

  const scoped =
    getScopedInfo(
      parts.pathname
    );

  try {
    return Boolean(
      scoped.scoped &&
      isBlockedRoutePath(
        scoped.restPath ||
        scoped.canonicalPath ||
        HOME_PATH
      )
    );
  } catch {
    return false;
  }
}

/* =========================================================
   AUTH
========================================================= */

function getAuth() {
  try {
    return (
      AppCore.getModule?.("auth") ||
      AppCore.modules?.get?.("auth") ||
      AppCore.auth ||
      AppCore.Auth ||
      null
    );
  } catch {
    return (
      AppCore.auth ||
      AppCore.Auth ||
      null
    );
  }
}

function authCall(
  method = "",
  fallback = null,
  ...args
) {
  const auth =
    getAuth();

  const fn =
    auth?.[method];

  if (
    !isFunction(fn)
  ) {
    return fallback;
  }

  try {
    return fn.call(
      auth,
      ...args
    );
  } catch {
    return fallback;
  }
}

function getAuthSession() {
  const auth =
    getAuth();

  return isObject(
    auth?.session
  )
    ? auth.session
    : {};
}

function getInFlightAuthPromise() {
  const session =
    getAuthSession();

  const candidate =
    session.restorePromise ||
    session.loginPromise ||
    session.mePromise ||
    session.refreshPromise ||
    null;

  return (
    candidate &&
    isFunction(
      candidate.then
    )
      ? candidate
      : null
  );
}

function isAuthResolving() {
  const session =
    getAuthSession();

  return Boolean(
    session.restoring ||
    session.loggingIn ||
    session.checking ||
    session.refreshing ||
    session.restorePromise ||
    session.loginPromise ||
    session.mePromise ||
    session.refreshPromise
  );
}

async function waitForAuthIfNeeded(
  route = null
) {
  if (
    !route ||
    route.public === true
  ) {
    return false;
  }

  if (
    authCall(
      "isAuthenticated",
      false
    ) === true
  ) {
    return false;
  }

  if (
    !isAuthResolving()
  ) {
    return false;
  }

  const promise =
    getInFlightAuthPromise();

  if (!promise) {
    return false;
  }

  try {
    await promise;
  } catch {
    // El guard decide después.
  }

  return true;
}

function isAuthenticated() {
  return (
    authCall(
      "isAuthenticated",
      false
    ) === true
  );
}

function getCurrentUser() {
  return (
    authCall(
      "getUser",
      null
    ) ||
    authCall(
      "getCurrentUser",
      null
    ) ||
    AppCore.getCurrentUser?.() ||
    null
  );
}

function getCurrentRole() {
  return (
    authCall(
      "getRole",
      ""
    ) ||
    authCall(
      "getCurrentRole",
      ""
    ) ||
    AppCore.getCurrentRole?.() ||
    ""
  );
}

function isAdmin() {
  return (
    authCall(
      "isAdmin",
      false
    ) === true ||
    getCurrentRole() ===
      "admin"
  );
}

function getCurrentUserSlug() {
  const fromAuth =
    authCall(
      "getUserSlug",
      ""
    );

  if (fromAuth) {
    return normalizeUserSlug(
      fromAuth
    );
  }

  const user =
    getCurrentUser();

  return normalizeUserSlug(
    user?.slug ||
    user?.lookup?.slug ||
    user?.profile?.slug ||
    user?.username ||
    user?.userId ||
    user?.id ||
    ""
  );
}

/* =========================================================
   USER SCOPE
========================================================= */

function getUserSlugFromPath(
  path = HOME_PATH
) {
  return (
    getScopedInfo(
      path
    ).slug ||
    ""
  );
}

function isUserHomePath(
  path = HOME_PATH
) {
  return (
    getScopedInfo(
      path
    ).home === true
  );
}

function isUserScopedPath(
  path = HOME_PATH
) {
  return (
    getScopedInfo(
      path
    ).scoped === true
  );
}

function buildUserHomePath(
  slug =
    getCurrentUserSlug()
) {
  const clean =
    normalizeUserSlug(
      slug
    );

  if (!clean) {
    return HOME_PATH;
  }

  try {
    return (
      buildUserHomeRoute(
        clean
      ) ||
      `${USER_HOME_PREFIX}${clean}`
    );
  } catch {
    return (
      `${USER_HOME_PREFIX}${clean}`
    );
  }
}

function buildUserScopedPath(
  canonicalPath = HOME_PATH,
  slug =
    getCurrentUserSlug()
) {
  const clean =
    normalizeUserSlug(
      slug
    );

  const canonical =
    normalizePathname(
      canonicalPath
    );

  if (!clean) {
    return canonical;
  }

  if (
    canonical ===
    PRIVATE_HOME_PATH
  ) {
    return buildUserHomePath(
      clean
    );
  }

  try {
    return buildUserScopedRoute(
      clean,
      canonical
    );
  } catch {
    return (
      canonical ===
      HOME_PATH
        ? `${USER_HOME_PREFIX}${clean}`
        : `${USER_HOME_PREFIX}${clean}${canonical}`
    );
  }
}

function getDefaultHome() {
  return buildUserHomePath();
}

/* =========================================================
   ROUTE MATCHING
========================================================= */

function getRouteByCanonicalPath(
  path = HOME_PATH
) {
  const canonical =
    normalizePathname(
      path
    );

  try {
    if (
      isFunction(
        Routes.getRouteByPath
      )
    ) {
      const route =
        Routes.getRouteByPath(
          canonical
        );

      if (route) {
        return route;
      }
    }
  } catch {
    // fallback abajo
  }

  return (
    getRoutes()
      .find(
        (route) =>
          normalizePathname(
            route.path
          ) ===
          canonical
      ) ||
    null
  );
}

function routeIsPrivate(
  route = null
) {
  return Boolean(
    route &&
    route.public !== true
  );
}

function routeRequiresAdmin(
  route = null
) {
  return Boolean(
    route?.adminOnly ||
    route?.requiresAdmin
  );
}

function routeAllowsSensitiveQuery(
  route = null
) {
  return Boolean(
    route?.tokenRoute ===
      true ||
    route?.requiresToken ===
      true ||
    route?.publicTokenRoute ===
      true
  );
}

function getRouteMatch(
  path = HOME_PATH
) {
  const publicPath =
    normalizePublicPath(
      path
    );

  const pathname =
    publicPathname(
      publicPath
    );

  const scoped =
    getScopedInfo(
      pathname
    );

  const lookupPath =
    canonicalLookupPath(
      pathname
    );

  const blocked =
    isBlockedPath(
      publicPath
    );

  let route =
    blocked
      ? null
      : getRouteByCanonicalPath(
          lookupPath
        );

  if (
    scoped.scoped &&
    route?.public === true
  ) {
    route = null;
  }

  const canonicalPath =
    route
      ? normalizePathname(
          route.path
        )
      : (
          lookupPath ||
          normalizePathname(
            pathname
          )
        );

  return {
    route,

    /*
      Puede contener token.
      Sólo vive en memoria durante la transición.
    */
    publicPath,

    pathname,

    canonicalPath,
    lookupPath,

    routeParams:
      scoped.slug
        ? {
            slug:
              scoped.slug,
          }
        : {},

    scoped,

    blocked,

    alias:
      !scoped.scoped &&
      normalizePathname(
        pathname
      ) !==
      normalizePathname(
        lookupPath
      ),

    sensitive:
      hasSensitiveQuery(
        publicPath
      ) ||
      isLegacyResetTokenPath(
        publicPath
      ),
  };
}

function getRoute(
  path = HOME_PATH
) {
  return (
    getRouteMatch(
      path
    ).route
  );
}

function routeExists(
  path = HOME_PATH
) {
  return Boolean(
    getRoute(path)
  );
}

function getCurrentRoute() {
  return getRoute(
    currentPublicPath()
  );
}

/* =========================================================
   REDIRECTS / GUARDS
========================================================= */

function isPublicAuthRoute(
  path = HOME_PATH
) {
  return (
    getRoute(path)
      ?.public === true
  );
}

function routeIsTokenRoute(
  path = HOME_PATH
) {
  return routeAllowsSensitiveQuery(
    getRoute(path)
  );
}

function isValidPostLoginTarget(
  path = ""
) {
  const target =
    normalizePublicPath(
      path
    );

  if (!target) {
    return false;
  }

  if (
    hasSensitiveQuery(
      target
    ) ||
    isLegacyResetTokenPath(
      target
    )
  ) {
    return false;
  }

  if (
    isBlockedPath(
      target
    )
  ) {
    return false;
  }

  if (
    isPublicAuthRoute(
      target
    )
  ) {
    return false;
  }

  return routeExists(
    target
  );
}

function loginRedirectTarget(
  publicPath = HOME_PATH
) {
  const target =
    normalizePublicPath(
      publicPath ||
      HOME_PATH
    );

  if (
    !isValidPostLoginTarget(
      target
    )
  ) {
    return LOGIN_PATH;
  }

  return (
    `${LOGIN_PATH}?redirect=${encodeURIComponent(target)}`
  );
}

function redirectParamFromCurrentLocation() {
  if (!isBrowser()) {
    return "";
  }

  try {
    return (
      new URLSearchParams(
        window.location.search ||
        ""
      ).get(
        "redirect"
      ) ||
      ""
    );
  } catch {
    return "";
  }
}

function normalizeNavigationTarget(
  path = HOME_PATH,
  options = {}
) {
  const publicPath =
    normalizePublicPath(
      path
    );

  const match =
    getRouteMatch(
      publicPath
    );

  if (
    options.useSlug !==
      false &&
    isAuthenticated() &&
    routeIsPrivate(
      match.route
    )
  ) {
    return withSearchHashFrom(
      publicPath,
      buildUserScopedPath(
        match.canonicalPath,
        getCurrentUserSlug()
      )
    );
  }

  if (
    options.useSlug !==
      false &&
    isAuthenticated() &&
    match.canonicalPath ===
      PRIVATE_HOME_PATH &&
    match.route?.public !==
      true
  ) {
    return withSearchHashFrom(
      publicPath,
      buildUserHomePath()
    );
  }

  return publicPath;
}

function normalizePostLoginTarget(
  fallback =
    getDefaultHome()
) {
  const target =
    redirectParamFromCurrentLocation();

  if (
    isValidPostLoginTarget(
      target
    )
  ) {
    return normalizeNavigationTarget(
      target
    );
  }

  return normalizeNavigationTarget(
    fallback ||
    getDefaultHome()
  );
}

function privateSlugRedirect(
  match = {}
) {
  const route =
    match.route;

  if (
    !routeIsPrivate(
      route
    ) ||
    !isAuthenticated()
  ) {
    return "";
  }

  const realSlug =
    getCurrentUserSlug();

  if (!realSlug) {
    return "";
  }

  const requestedSlug =
    normalizeUserSlug(
      match.routeParams
        ?.slug ||
      ""
    );

  const expectedPathname =
    buildUserScopedPath(
      match.canonicalPath,
      realSlug
    );

  const currentPathname =
    publicPathname(
      match.publicPath
    );

  if (
    !requestedSlug &&
    currentPathname ===
      match.canonicalPath
  ) {
    return withSearchHashFrom(
      match.publicPath,
      expectedPathname
    );
  }

  if (
    requestedSlug &&
    requestedSlug !==
      realSlug
  ) {
    return withSearchHashFrom(
      match.publicPath,
      expectedPathname
    );
  }

  if (
    currentPathname !==
    expectedPathname
  ) {
    return withSearchHashFrom(
      match.publicPath,
      expectedPathname
    );
  }

  return "";
}

function checkAccess(
  match = {}
) {
  const route =
    match.route;

  if (!route) {
    return {
      allowed: false,
      reason:
        "not-found",
    };
  }

  if (
    route.public ===
    true
  ) {
    if (
      route.guestOnly ===
        true &&
      isAuthenticated()
    ) {
      return {
        allowed: false,

        reason:
          "guest-only",

        redirectTo:
          normalizePostLoginTarget(
            getDefaultHome()
          ),
      };
    }

    return {
      allowed: true,
      reason:
        "public",
    };
  }

  if (
    !isAuthenticated()
  ) {
    return {
      allowed: false,

      reason:
        "not-authenticated",

      redirectTo:
        loginRedirectTarget(
          match.publicPath
        ),
    };
  }

  if (
    routeRequiresAdmin(
      route
    ) &&
    !isAdmin()
  ) {
    return {
      allowed: false,
      reason:
        "admin-required",
    };
  }

  return {
    allowed: true,

    reason:
      routeRequiresAdmin(
        route
      )
        ? "admin"
        : "authenticated",
  };
}

async function syncPrivateRuntimeForRoute(
  route = null,
  options = {}
) {
  if (!route || route.public === true) {
    if (!isAuthenticated()) {
      destroyPrivateRuntimeUI();
    }
    return true;
  }

  if (!isAuthenticated()) return false;

  return ensurePrivateRuntimeUI({
    AppCore,
    Auth: getAuth(),
    Router,
    route,
    source: options.source || "router",
  });
}

/* =========================================================
   TRANSITION CANCELLATION
========================================================= */

function abortActiveTransition(
  reason =
    "router-transition-superseded"
) {
  const transition =
    activeTransition;

  if (!transition) {
    return false;
  }

  try {
    transition.abort(
      reason
    );
  } catch {
    // noop
  }

  return true;
}

function createTransition(
  seq = renderSeq,
  externalSignal = null
) {
  const performanceId =
    `nav:${Math.max(
      0,
      Number(seq) || 0
    ).toString(36)}`;

  if (
    typeof AbortController ===
    "undefined"
  ) {
    const transition = {
      seq,
      performanceId,
      performanceViewKey:
        "",

      signal:
        externalSignal ||
        null,

      abort:
        () => false,

      cleanup:
        () => {},

      isCurrent:
        () =>
          seq ===
          renderSeq &&
          !externalSignal
            ?.aborted,
    };

    activeTransition =
      transition;

    return transition;
  }

  const controller =
    new AbortController();

  let externalListener =
    null;

  const abort =
    (reason = undefined) => {
      if (
        controller.signal.aborted
      ) {
        return false;
      }

      try {
        controller.abort(
          reason
        );
      } catch {
        try {
          controller.abort();
        } catch {
          return false;
        }
      }

      return true;
    };

  if (
    externalSignal
  ) {
    if (
      externalSignal.aborted
    ) {
      abort(
        externalSignal.reason
      );
    } else if (
      isFunction(
        externalSignal
          .addEventListener
      )
    ) {
      externalListener =
        () => {
          abort(
            externalSignal.reason
          );
        };

      externalSignal.addEventListener(
        "abort",
        externalListener,
        {
          once: true,
        }
      );
    }
  }

  const transition = {
    seq,
    performanceId,
    performanceViewKey:
      "",

    signal:
      controller.signal,

    abort,

    isCurrent:
      () =>
        seq ===
          renderSeq &&
        !controller.signal
          .aborted,

    cleanup:
      () => {
        if (
          externalSignal &&
          externalListener &&
          isFunction(
            externalSignal
              .removeEventListener
          )
        ) {
          try {
            externalSignal
              .removeEventListener(
                "abort",
                externalListener
              );
          } catch {
            // noop
          }
        }

        externalListener =
          null;
      },
  };

  activeTransition =
    transition;

  return transition;
}

function transitionIsCurrent(
  transition = null
) {
  return Boolean(
    transition &&
    isFunction(
      transition.isCurrent
    ) &&
    transition.isCurrent()
  );
}

/* =========================================================
   HISTORY
========================================================= */

function ensureInitialHistoryState() {
  if (!isBrowser()) {
    return false;
  }

  try {
    const current =
      browserPath();

    /*
      Siempre reescribimos history.state con versión mínima y saneada.
      Así una recarga no puede conservar state antiguo con token.
      La URL visible permanece intacta.
    */
    window.history.replaceState(
      {
        router: true,

        path:
          stateSafePublicPath(
            current
          ),
      },
      "",
      current
    );

    return true;
  } catch {
    return false;
  }
}

function writeHistory(
  publicPath = HOME_PATH,
  options = {}
) {
  if (
    !isBrowser() ||
    options.skipHistory ===
      true
  ) {
    return false;
  }

  const target =
    normalizePublicPath(
      publicPath
    );

  const current =
    browserPath();

  const statePath =
    stateSafePublicPath(
      target
    );

  try {
    const method =
      options.replaceState ===
        true ||
      current ===
        target
        ? "replaceState"
        : "pushState";

    window.history[
      method
    ](
      {
        router: true,
        path:
          statePath,
      },
      "",
      target
    );

    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   SHELL / CHROME
========================================================= */

function node(
  id = ""
) {
  if (!isBrowser()) {
    return null;
  }

  return document
    .getElementById(
      id
    );
}

function setHidden(
  element = null,
  hidden = false
) {
  if (!element) {
    return false;
  }

  const value =
    Boolean(hidden);

  let changed = false;

  try {
    if (
      element.hidden !==
      value
    ) {
      element.hidden =
        value;

      changed = true;
    }

    changed =
      setAttributeIfChanged(
        element,
        "aria-hidden",
        value
          ? "true"
          : "false"
      ) ||
      changed;

    return changed;
  } catch {
    return false;
  }
}

function forceVisible(
  element = null,
  mode = "app",
  chrome = "visible"
) {
  if (!element) {
    return false;
  }

  try {
    let changed = false;

    if (
      element.hidden ===
      true
    ) {
      element.hidden =
        false;

      changed = true;
    }

    if (
      element.hasAttribute(
        "hidden"
      )
    ) {
      element.removeAttribute(
        "hidden"
      );

      changed = true;
    }

    if (
      element.hasAttribute(
        "inert"
      )
    ) {
      element.removeAttribute(
        "inert"
      );

      changed = true;
    }

    changed =
      setAttributeIfChanged(
        element,
        "aria-hidden",
        "false"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        element,
        "routeMode",
        mode
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        element,
        "shell",
        "visible"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        element,
        "shellState",
        "ready"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        element,
        "appReady",
        "true"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        element,
        "appLoading",
        "false"
      ) ||
      changed;

    changed =
      setDatasetIfChanged(
        element,
        "chrome",
        chrome
      ) ||
      changed;

    for (
      const className
      of [
        "is-hidden",
        "app-hidden",
        "shell-hidden",
        "route-hidden",
        "chrome-hidden",
      ]
    ) {
      changed =
        setClassState(
          element,
          className,
          false
        ) ||
        changed;
    }

    changed =
      setClassState(
        element,
        "is-visible",
        true
      ) ||
      changed;

    for (
      const property
      of [
        "display",
        "visibility",
        "opacity",
        "pointer-events",
      ]
    ) {
      if (
        element.style
          ?.getPropertyValue(
            property
          )
      ) {
        element.style
          .removeProperty(
            property
          );

        changed = true;
      }
    }

    return changed;
  } catch {
    return false;
  }
}

function clearTableHead() {
  const tableHead =
    node(
      "table-head"
    );

  const tableHeadContainer =
    node(
      "tablehead-container"
    );

  setHidden(
    tableHead,
    true
  );

  try {
    if (
      tableHeadContainer
        ?.childNodes
        ?.length
    ) {
      tableHeadContainer
        .replaceChildren();
    }
  } catch {
    // noop
  }

  return true;
}

function setShell(
  route = null
) {
  const publicRoute =
    route?.public ===
    true;

  const mode =
    publicRoute
      ? "auth"
      : "app";

  const chrome =
    publicRoute
      ? "hidden"
      : "visible";

  const html =
    isBrowser()
      ? document
          .documentElement
      : null;

  const body =
    isBrowser()
      ? document.body
      : null;

  for (
    const root
    of [
      html,
      body,
    ].filter(Boolean)
  ) {
    setDatasetIfChanged(
      root,
      "routeMode",
      mode
    );

    setDatasetIfChanged(
      root,
      "shell",
      "visible"
    );

    setDatasetIfChanged(
      root,
      "shellState",
      "ready"
    );

    setDatasetIfChanged(
      root,
      "appReady",
      "true"
    );

    setDatasetIfChanged(
      root,
      "appLoading",
      "false"
    );

    setDatasetIfChanged(
      root,
      "chrome",
      chrome
    );

    setClassState(
      root,
      "route-auth",
      publicRoute
    );

    setClassState(
      root,
      "route-app",
      !publicRoute
    );

    setClassState(
      root,
      "chrome-hidden",
      publicRoute
    );

    setClassState(
      root,
      "chrome-visible",
      !publicRoute
    );
  }

  for (
    const element
    of [
      node("app-shell"),
      node("main-content"),
      node("app-content"),
      node("view-container"),
    ].filter(Boolean)
  ) {
    forceVisible(
      element,
      mode,
      chrome
    );
  }

  const sidebar =
    node(
      "sidebar-mount"
    );

  const topbar =
    node(
      "topbar-mount"
    );

  setHidden(
    sidebar,
    publicRoute
  );

  setHidden(
    topbar,
    publicRoute
  );

  for (
    const element
    of [
      sidebar,
      topbar,
    ].filter(Boolean)
  ) {
    setDatasetIfChanged(
      element,
      "routeMode",
      mode
    );

    setDatasetIfChanged(
      element,
      "chrome",
      chrome
    );

    setClassState(
      element,
      "is-hidden",
      publicRoute
    );

    setClassState(
      element,
      "is-visible",
      !publicRoute
    );
  }

  clearTableHead();

  return true;
}

function setDocumentTitle(
  route = null
) {
  if (!isBrowser()) {
    return false;
  }

  const title =
    cleanText(
      route?.title ||
      route?.name ||
      "",
      ""
    );

  const next =
    title
      ? `${title} · ${APP_TITLE}`
      : APP_TITLE;

  if (
    document.title ===
    next
  ) {
    return false;
  }

  document.title =
    next;

  return true;
}

function setActiveMenu(
  route = null,
  context = {}
) {
  if (!isBrowser()) {
    return false;
  }

  const key =
    cleanText(
      route?.sidebarKey ||
      route?.viewKey ||
      route?.name ||
      "",
      ""
    );

  const canonicalPath =
    normalizePathname(
      context.canonicalPath ||
      route?.path ||
      HOME_PATH
    );

  const publicPath =
    normalizePublicPath(
      context.publicPath ||
      ""
    );

  const pending =
    context.pending ===
    true;

  for (
    const item
    of document.querySelectorAll(
      "#sidebar-mount [data-sidebar-key], #sidebar-mount [data-route]"
    )
  ) {
    const itemKey =
      cleanText(
        item.getAttribute(
          "data-sidebar-key"
        ),
        ""
      );

    const itemRoute =
      cleanText(
        item.getAttribute(
          "data-route"
        ),
        ""
      );

    const itemCanonical =
      itemRoute
        ? canonicalPathFromPublicPath(
            itemRoute
          )
        : "";

    const active =
      Boolean(
        (
          key &&
          itemKey ===
            key
        ) ||
        (
          canonicalPath &&
          itemCanonical ===
            canonicalPath
        ) ||
        (
          publicPath &&
          itemRoute ===
            publicPath
        )
      );

    setClassState(
      item,
      "is-active",
      active
    );

    setClassState(
      item,
      "is-pending",
      active &&
      pending
    );

    if (active) {
      setAttributeIfChanged(
        item,
        "aria-current",
        "page"
      );

      setAttributeIfChanged(
        item,
        "data-route-pending",
        pending
          ? "true"
          : "false"
      );
    } else {
      item.removeAttribute(
        "aria-current"
      );

      item.removeAttribute(
        "data-route-pending"
      );
    }
  }

  return true;
}

function syncChrome(
  route = null,
  context = {}
) {
  const modules =
    new Set(
      [
        AppCore.sidebar,
        AppCore.Sidebar,
        AppCore.getModule?.(
          "sidebar"
        ),
        AppCore.topbar,
        AppCore.Topbar,
        AppCore.getModule?.(
          "topbar"
        ),
      ].filter(Boolean)
    );

  for (
    const module
    of modules
  ) {
    try {
      if (
        isFunction(
          module.sync
        )
      ) {
        module.sync(
          context
        );
      } else if (
        isFunction(
          module.refresh
        )
      ) {
        module.refresh(
          context
        );
      }
    } catch {
      // noop
    }
  }

  return true;
}

/* =========================================================
   ROUTE PENDING STATE
========================================================= */

function setElementBusy(
  element = null,
  busy = false
) {
  if (!element) {
    return false;
  }

  const value =
    busy === true;

  setAttributeIfChanged(
    element,
    "aria-busy",
    value
      ? "true"
      : "false"
  );

  setClassState(
    element,
    "is-route-pending",
    value
  );

  setDatasetIfChanged(
    element,
    "routePending",
    value
      ? "true"
      : "false"
  );

  return true;
}

function setRoutePending(
  match = {},
  options = {},
  seq = renderSeq
) {
  if (!isBrowser()) {
    return false;
  }

  const route =
    match.route ||
    null;

  const internalPublicPath =
    normalizePublicPath(
      match.publicPath ||
      HOME_PATH
    );

  const safePublicPath =
    stateSafePublicPath(
      match
    );

  const canonicalPath =
    normalizePathname(
      match.canonicalPath ||
      route?.path ||
      HOME_PATH
    );

  const viewKey =
    cleanText(
      route?.viewKey ||
      route?.name ||
      "",
      ""
    );

  pendingSeq =
    seq;

  /*
    Variable interna; nunca se vuelca sin sanitizar.
  */
  pendingPath =
    internalPublicPath;

  const html =
    document.documentElement;

  const body =
    document.body;

  for (
    const root
    of [
      html,
      body,
    ].filter(Boolean)
  ) {
    setClassState(
      root,
      "route-pending",
      true
    );

    setClassState(
      root,
      "is-route-pending",
      true
    );

    setDatasetIfChanged(
      root,
      "routePending",
      "true"
    );

    setDatasetIfChanged(
      root,
      "routePendingPath",
      safePublicPath
    );

    setDatasetIfChanged(
      root,
      "routePendingCanonicalPath",
      canonicalPath
    );

    setDatasetIfChanged(
      root,
      "routePendingView",
      viewKey
    );

    setDatasetIfChanged(
      root,
      "routePendingSource",
      cleanText(
        options.source,
        "router"
      )
    );
  }

  for (
    const element
    of [
      node("app-shell"),
      node("main-content"),
      node("app-content"),
      node("view-container"),
    ].filter(Boolean)
  ) {
    setElementBusy(
      element,
      true
    );
  }

  setActiveMenu(
    route,
    {
      publicPath:
        safePublicPath,

      canonicalPath,

      pending:
        true,
    }
  );

  writeState({
    routePending:
      true,

    pendingPublicPath:
      safePublicPath,

    pendingCanonicalPath:
      canonicalPath,

    pendingViewKey:
      viewKey,
  });

  return true;
}

function clearRoutePending(
  seq = renderSeq
) {
  if (!isBrowser()) {
    return false;
  }

  if (
    seq &&
    pendingSeq &&
    seq !==
      pendingSeq
  ) {
    return false;
  }

  pendingSeq = 0;
  pendingPath = "";

  const html =
    document.documentElement;

  const body =
    document.body;

  for (
    const root
    of [
      html,
      body,
    ].filter(Boolean)
  ) {
    setClassState(
      root,
      "route-pending",
      false
    );

    setClassState(
      root,
      "is-route-pending",
      false
    );

    delete root
      .dataset
      .routePending;

    delete root
      .dataset
      .routePendingPath;

    delete root
      .dataset
      .routePendingCanonicalPath;

    delete root
      .dataset
      .routePendingView;

    delete root
      .dataset
      .routePendingSource;
  }

  for (
    const element
    of [
      node("app-shell"),
      node("main-content"),
      node("app-content"),
      node("view-container"),
    ].filter(Boolean)
  ) {
    setElementBusy(
      element,
      false
    );
  }

  writeState({
    routePending:
      false,

    pendingPublicPath:
      "",

    pendingCanonicalPath:
      "",

    pendingViewKey:
      "",
  });

  return true;
}

/* =========================================================
   RENDER HOST / CLEANUP
========================================================= */

function viewRoot() {
  if (!isBrowser()) {
    return null;
  }

  return (
    node(
      "view-container"
    ) ||
    node(
      "app-content"
    ) ||
    node(
      "main-content"
    ) ||
    document.body ||
    null
  );
}

function cleanupView(
  view = null
) {
  if (
    isFunction(view)
  ) {
    try {
      view();
      return true;
    } catch {
      return false;
    }
  }

  if (
    !view ||
    !isObject(view)
  ) {
    return false;
  }

  for (
    const method
    of [
      "destroy",
      "unmount",
      "cleanup",
      "dispose",
    ]
  ) {
    try {
      if (
        isFunction(
          view[method]
        )
      ) {
        view[method]();
        return true;
      }
    } catch {
      // noop
    }
  }

  return false;
}

function removeNode(
  element = null
) {
  try {
    element?.remove?.();
    return true;
  } catch {
    return false;
  }
}

function destroyActiveView() {
  const previousView =
    activeView;

  const previousHost =
    activeHost;

  activeView = null;
  activeHost = null;

  cleanupView(
    previousView
  );

  removeNode(
    previousHost
  );

  return true;
}

function createRouteHost(
  match = {},
  state = {}
) {
  const route =
    match.route ||
    null;

  const host =
    document.createElement(
      "div"
    );

  host.className =
    ROUTE_HOST_CLASS;

  host.hidden =
    true;

  host.setAttribute(
    "aria-hidden",
    "true"
  );

  host.setAttribute(
    "aria-busy",
    "true"
  );

  host.dataset.routeHost =
    "true";

  host.dataset.routeHostState =
    "preparing";

  host.dataset.routePath =
    state.canonicalPath ||
    match.canonicalPath ||
    HOME_PATH;

  /*
    Nunca colocamos token/query sensible en el DOM.
  */
  host.dataset.publicPath =
    stateSafePublicPath(
      match
    );

  host.dataset.viewKey =
    route?.viewKey ||
    route?.name ||
    "";

  return host;
}

function activateRouteHost(
  host = null,
  route = null
) {
  if (!host) {
    return false;
  }

  const publicRoute =
    route?.public ===
    true;

  const mode =
    publicRoute
      ? "auth"
      : "app";

  const chrome =
    publicRoute
      ? "hidden"
      : "visible";

  try {
    host.hidden =
      false;

    host.removeAttribute(
      "hidden"
    );

    host.removeAttribute(
      "inert"
    );

    setAttributeIfChanged(
      host,
      "aria-hidden",
      "false"
    );

    setAttributeIfChanged(
      host,
      "aria-busy",
      "false"
    );

    setDatasetIfChanged(
      host,
      "routeHostState",
      "ready"
    );

    setDatasetIfChanged(
      host,
      "routeMode",
      mode
    );

    setDatasetIfChanged(
      host,
      "chrome",
      chrome
    );

    setClassState(
      host,
      "is-hidden",
      false
    );

    setClassState(
      host,
      "is-preparing",
      false
    );

    setClassState(
      host,
      "is-visible",
      true
    );

    setClassState(
      host,
      "is-ready",
      true
    );

    return true;
  } catch {
    return false;
  }
}

function commitRouteHost(
  nextHost = null,
  {
    route = null,
    nextView = null,
    previousView = null,
    previousHost = null,
  } = {}
) {
  const root =
    viewRoot();

  if (
    !root ||
    !nextHost
  ) {
    return false;
  }

  activateRouteHost(
    nextHost,
    route
  );

  try {
    if (
      nextHost.parentNode !==
      root
    ) {
      root.appendChild(
        nextHost
      );
    }

    root.replaceChildren(
      nextHost
    );
  } catch {
    return false;
  }

  activeHost =
    nextHost;

  activeView =
    nextView ||
    null;

  cleanupView(
    previousView
  );

  if (
    previousHost &&
    previousHost !==
      nextHost
  ) {
    removeNode(
      previousHost
    );
  }

  return true;
}

function renderFallback(
  title =
    "Onion Support",
  message = "",
  host = null
) {
  const target =
    host ||
    activeHost ||
    viewRoot();

  if (!target) {
    return null;
  }

  const section =
    document.createElement(
      "section"
    );

  section.className =
    "route-fallback-view";

  section.setAttribute(
    "role",
    "status"
  );

  const heading =
    document.createElement(
      "h1"
    );

  heading.textContent =
    title;

  section.appendChild(
    heading
  );

  if (message) {
    const paragraph =
      document.createElement(
        "p"
      );

    paragraph.textContent =
      message;

    section.appendChild(
      paragraph
    );
  }

  target.replaceChildren(
    section
  );

  return section;
}

/* =========================================================
   COMMIT STATE / HISTORY
========================================================= */

function setRouteState(
  match = {}
) {
  const safePublicPath =
    stateSafePublicPath(
      match
    );

  const patch = {
    route:
      match.canonicalPath ||
      HOME_PATH,

    canonicalPath:
      match.canonicalPath ||
      HOME_PATH,

    /*
      Token/query sensible deliberadamente excluido de AppCore.state.
    */
    publicPath:
      safePublicPath,

    routeParams:
      match.routeParams ||
      {},

    initialRouteRendered:
      true,
  };

  writeState(
    patch
  );

  return patch;
}

function beginTransition(
  match = {},
  options = {}
) {
  const route =
    match.route ||
    null;

  const state =
    setRouteState(
      match
    );

  setShell(
    route
  );

  setDocumentTitle(
    route
  );

  setActiveMenu(
    route,
    {
      publicPath:
        state.publicPath,

      canonicalPath:
        state.canonicalPath,

      pending:
        false,
    }
  );

  /*
    History conserva la URL real.
    history.state usa siempre una versión sanitizada.
  */
  writeHistory(
    match.publicPath ||
    state.publicPath,
    options
  );

  return state;
}

/* =========================================================
   ROUTE STYLE TRANSITION
========================================================= */

async function preloadRouteStylesForTransition(
  route = null,
  transition = null
) {
  return RouteStyles.preload(
    route,
    {
      signal:
        transition?.signal ||
        null,
    }
  );
}

async function prepareRouteStylesForTransition(
  route = null,
  transition = null
) {
  return RouteStyles.prepare(
    route,
    {
      signal:
        transition?.signal ||
        null,
    }
  );
}

function rollbackRouteStylesForTransition(
  route = null
) {
  try {
    return RouteStyles.rollback(
      route
    );
  } catch {
    return null;
  }
}

function commitRouteStylesForTransition(
  route = null
) {
  try {
    return RouteStyles.commit(
      route
    );
  } catch {
    /*
      El DOM nuevo ya puede estar comprometido.
      Nunca hacemos clear aquí: sería peor dejar
      la nueva vista sin el CSS ya preparado.
    */
    return null;
  }
}

function clearRouteStylesForFallback(
  reason = "fallback"
) {
  try {
    return RouteStyles.clear({
      reason,
    });
  } catch {
    return null;
  }
}


/* =========================================================
   ROUTE RENDER
========================================================= */

async function renderRoute(
  match = {},
  options = {},
  seq = renderSeq,
  transition = null
) {
  const route =
    match.route;

  const root =
    viewRoot();

  if (!root) {
    return {
      ok: false,
      reason:
        "missing-root",
    };
  }

  /*
    Snapshot de la ruta realmente comprometida.
    setRoutePending() sólo contiene estado provisional.
  */
  const previousState =
    readState();

  const previousCanonicalPath =
    normalizePathname(
      previousState.canonicalPath ||
      previousState.route ||
      HOME_PATH
    );

  const previousPublicPath =
    normalizePublicPath(
      previousState.publicPath ||
      previousCanonicalPath
    );

  const previousRoute =
    getRoute(
      previousCanonicalPath
    );

  /*
    PRELOAD:
    descarga el CSS con media="not all".
    No aplica todavía estilos de la vista nueva.
  */
  if (
    isFunction(
      route?.render
    )
  ) {
    const stylePreloadStartedAt =
      performanceNow();

    try {
      await preloadRouteStylesForTransition(
        route,
        transition
      );
    } catch (error) {
      recordTransitionPhase(
        transition,
        route,
        "style-load",
        stylePreloadStartedAt
      );

      rollbackRouteStylesForTransition(
        route
      );

      if (
        seq !==
          renderSeq ||
        !transitionIsCurrent(
          transition
        )
      ) {
        return {
          ok: false,
          skipped: true,

          reason:
            transition?.signal
              ?.aborted
              ? "aborted-style-preload"
              : "stale-style-preload",
        };
      }

      /*
        El sidebar pudo quedar marcado provisionalmente
        por setRoutePending(). Restauramos la ruta activa.
      */
      setActiveMenu(
        previousRoute,
        {
          publicPath:
            previousPublicPath,

          canonicalPath:
            previousCanonicalPath,

          pending:
            false,
        }
      );

      return {
        ok: false,

        reason:
          "style-preload-failed",

        error,

        canonicalPath:
          normalizePathname(
            match.canonicalPath ||
            route?.path ||
            HOME_PATH
          ),

        publicPath:
          stateSafePublicPath(
            match
          ),
      };
    }

    recordTransitionPhase(
      transition,
      route,
      "style-load",
      stylePreloadStartedAt
    );

    if (
      seq !==
        renderSeq ||
      !transitionIsCurrent(
        transition
      )
    ) {
      rollbackRouteStylesForTransition(
        route
      );

      return {
        ok: false,
        skipped: true,

        reason:
          transition?.signal
            ?.aborted
            ? "aborted-style-preload"
            : "stale-style-preload",
      };
    }
  }

  /*
    El CSS ya está descargado, o el loader ha hecho skip
    porque los safety gates siguen apagados.
  */
  const initialChromeStartedAt =
    performanceNow();

  const state =
    beginTransition(
      match,
      options
    );

  forceVisible(
    root,
    route?.public ===
      true
      ? "auth"
      : "app",
    route?.public ===
      true
      ? "hidden"
      : "visible"
  );

  recordTransitionPhase(
    transition,
    route,
    "chrome",
    initialChromeStartedAt
  );

  const previousView =
    activeView;

  const previousHost =
    activeHost;

  const nextHost =
    createRouteHost(
      match,
      state
    );

  try {
    root.appendChild(
      nextHost
    );
  } catch {
    rollbackRouteStylesForTransition(
      route
    );

    return {
      ok: false,
      reason:
        "mount-host-failed",
    };
  }

  try {
    if (
      !isFunction(
        route?.render
      )
    ) {
      throw new Error(
        "La ruta no tiene render()."
      );
    }

    const viewWasLoaded =
      Routes.isRouteViewLoaded?.(
        route?.viewKey ||
        route?.name ||
        ""
      ) === true;

    const viewPhase =
      viewWasLoaded
        ? "view-warm"
        : "view-cold";

    const viewStartedAt =
      performanceNow();

    let result = null;

    try {
      /*
        ÚNICO punto donde la vista recibe el publicPath completo.
        También recibe AbortSignal de la transición; las vistas que
        no lo consuman siguen protegidas por renderSeq.
      */
      result =
        await route.render(
          nextHost,
          {
            AppCore,

            Auth:
              getAuth(),

            Router,

            route,

            canonicalPath:
              state.canonicalPath,

            publicPath:
              match.publicPath,

            routeParams:
              state.routeParams,

            source:
              "router",

            signal:
              transition
                ?.signal ||
              null,

            isCurrentRender:
              () =>
                seq ===
                  renderSeq &&
                transitionIsCurrent(
                  transition
                ),
          }
        );
    } finally {
      recordTransitionPhase(
        transition,
        route,
        viewPhase,
        viewStartedAt
      );
    }

    if (
      seq !==
        renderSeq ||
      !transitionIsCurrent(
        transition
      )
    ) {
      rollbackRouteStylesForTransition(
        route
      );

      cleanupView(
        result
      );

      removeNode(
        nextHost
      );

      return {
        ok: false,
        skipped: true,

        reason:
          transition?.signal
            ?.aborted
            ? "aborted-render"
            : "stale-render",
      };
    }

    let nextView =
      null;

    if (
      typeof Node !==
        "undefined" &&
      result instanceof
        Node &&
      result !==
        nextHost &&
      !nextHost.contains(
        result
      )
    ) {
      nextHost.replaceChildren(
        result
      );
    } else if (
      typeof result ===
      "string"
    ) {
      nextHost.textContent =
        "";

      nextHost.insertAdjacentHTML(
        "beforeend",
        result
      );
    } else if (
      isFunction(result) ||
      isObject(result)
    ) {
      nextView =
        result;
    }

    if (
      !transitionIsCurrent(
        transition
      )
    ) {
      rollbackRouteStylesForTransition(
        route
      );

      cleanupView(
        nextView
      );

      removeNode(
        nextHost
      );

      return {
        ok: false,
        skipped: true,
        reason:
          "stale-before-commit",
      };
    }

    /*
      PREPARE:
      el CSS ya está descargado. Lo activamos únicamente
      en la ventana inmediatamente anterior al DOM commit.
      La hoja anterior continúa activa hasta commit().
    */
    const stylePrepareStartedAt =
      performanceNow();

    try {
      await prepareRouteStylesForTransition(
        route,
        transition
      );
    } catch (error) {
      recordTransitionPhase(
        transition,
        route,
        "style-load",
        stylePrepareStartedAt
      );

      rollbackRouteStylesForTransition(
        route
      );

      cleanupView(
        nextView
      );

      removeNode(
        nextHost
      );

      if (
        seq !==
          renderSeq ||
        !transitionIsCurrent(
          transition
        )
      ) {
        return {
          ok: false,
          skipped: true,

          reason:
            transition?.signal
              ?.aborted
              ? "aborted-style-prepare"
              : "stale-style-prepare",
        };
      }

      return {
        ok: false,

        reason:
          "style-prepare-failed",

        error,

        canonicalPath:
          state.canonicalPath,

        publicPath:
          state.publicPath,
      };
    }

    recordTransitionPhase(
      transition,
      route,
      "style-load",
      stylePrepareStartedAt
    );

    if (
      seq !==
        renderSeq ||
      !transitionIsCurrent(
        transition
      )
    ) {
      rollbackRouteStylesForTransition(
        route
      );

      cleanupView(
        nextView
      );

      removeNode(
        nextHost
      );

      return {
        ok: false,
        skipped: true,

        reason:
          transition?.signal
            ?.aborted
            ? "aborted-style-prepare"
            : "stale-style-prepare",
      };
    }

    const commitStartedAt =
      performanceNow();

    const committed =
      commitRouteHost(
        nextHost,
        {
          route,
          nextView,
          previousView,
          previousHost,
        }
      );

    recordTransitionPhase(
      transition,
      route,
      "commit",
      commitStartedAt
    );

    if (!committed) {
      rollbackRouteStylesForTransition(
        route
      );

      cleanupView(
        nextView
      );

      removeNode(
        nextHost
      );

      return {
        ok: false,

        reason:
          "commit-failed",

        canonicalPath:
          state.canonicalPath,

        publicPath:
          state.publicPath,
      };
    }

    const styleCommitStartedAt =
      performanceNow();

    commitRouteStylesForTransition(
      route
    );

    recordTransitionPhase(
      transition,
      route,
      "style-load",
      styleCommitStartedAt
    );

    const chromeStartedAt =
      performanceNow();

    syncChrome(
      route,
      {
        AppCore,

        Auth:
          getAuth(),

        Router,

        route,

        canonicalPath:
          state.canonicalPath,

        publicPath:
          state.publicPath,

        routeParams:
          state.routeParams,
      }
    );

    recordTransitionPhase(
      transition,
      route,
      "chrome",
      chromeStartedAt
    );

    return {
      ok: true,
      found: true,

      route,

      canonicalPath:
        state.canonicalPath,

      /*
        Nunca devolvemos token aquí.
      */
      publicPath:
        state.publicPath,

      routeParams:
        state.routeParams,
    };
  } catch (error) {
    if (
      seq !==
        renderSeq ||
      !transitionIsCurrent(
        transition
      )
    ) {
      rollbackRouteStylesForTransition(
        route
      );

      removeNode(
        nextHost
      );

      return {
        ok: false,
        skipped: true,

        reason:
          transition?.signal
            ?.aborted
            ? "aborted-error"
            : "stale-error",
      };
    }

    rollbackRouteStylesForTransition(
      route
    );

    renderFallback(
      "Error de vista",
      "No se pudo renderizar esta vista.",
      nextHost
    );

    const committed =
      commitRouteHost(
        nextHost,
        {
          route,

          nextView:
            null,

          previousView,
          previousHost,
        }
      );

    if (committed) {
      clearRouteStylesForFallback(
        "view-error"
      );

      syncChrome(
        route,
        {
          AppCore,

          Auth:
            getAuth(),

          Router,

          route,

          canonicalPath:
            state.canonicalPath,

          publicPath:
            state.publicPath,

          routeParams:
            state.routeParams,
        }
      );
    }

    return {
      ok: false,

      error,

      canonicalPath:
        state.canonicalPath,

      publicPath:
        state.publicPath,
    };
  }
}

function renderNotFound(
  match = {},
  options = {},
  seq = renderSeq,
  transition = null
) {
  if (
    transition &&
    !transitionIsCurrent(
      transition
    )
  ) {
    return {
      ok: false,
      skipped: true,
      reason:
        "stale-not-found",
    };
  }

  const state =
    beginTransition(
      {
        ...match,

        route:
          null,

        canonicalPath:
          match.canonicalPath ||
          HOME_PATH,
      },
      options
    );

  const root =
    viewRoot();

  if (!root) {
    return {
      ok: false,
      found: false,
      reason:
        "missing-root",
      renderSeq:
        seq,
    };
  }

  const previousView =
    activeView;

  const previousHost =
    activeHost;

  const nextHost =
    createRouteHost(
      {
        ...match,
        route:
          null,
      },
      state
    );

  root.appendChild(
    nextHost
  );

  renderFallback(
    "Ruta no encontrada",
    "La vista solicitada no existe.",
    nextHost
  );

  if (
    transition &&
    !transitionIsCurrent(
      transition
    )
  ) {
    removeNode(
      nextHost
    );

    return {
      ok: false,
      skipped: true,
      reason:
        "stale-not-found",
    };
  }

  const committed =
    commitRouteHost(
      nextHost,
      {
        route:
          null,

        nextView:
          null,

        previousView,
        previousHost,
      }
    );

  if (!committed) {
    removeNode(
      nextHost
    );

    return {
      ok: false,
      found: false,

      reason:
        "commit-failed",

      renderSeq:
        seq,
    };
  }

  clearRouteStylesForFallback(
    "not-found"
  );

  return {
    ok: true,
    found: false,

    canonicalPath:
      state.canonicalPath,

    publicPath:
      state.publicPath,

    routeParams:
      state.routeParams,

    renderSeq:
      seq,
  };
}

function renderForbidden(
  match = {},
  reason =
    "forbidden",
  options = {},
  seq = renderSeq,
  transition = null
) {
  if (
    transition &&
    !transitionIsCurrent(
      transition
    )
  ) {
    return {
      ok: false,
      skipped: true,
      reason:
        "stale-forbidden",
    };
  }

  const state =
    beginTransition(
      match,
      options
    );

  const root =
    viewRoot();

  if (!root) {
    return {
      ok: false,

      forbidden: true,

      reason:
        "missing-root",

      renderSeq:
        seq,
    };
  }

  const previousView =
    activeView;

  const previousHost =
    activeHost;

  const nextHost =
    createRouteHost(
      match,
      state
    );

  root.appendChild(
    nextHost
  );

  renderFallback(
    "Acceso no permitido",
    "No tienes permisos para ver esta vista.",
    nextHost
  );

  if (
    transition &&
    !transitionIsCurrent(
      transition
    )
  ) {
    removeNode(
      nextHost
    );

    return {
      ok: false,
      skipped: true,
      reason:
        "stale-forbidden",
    };
  }

  const committed =
    commitRouteHost(
      nextHost,
      {
        route:
          match.route ||
          null,

        nextView:
          null,

        previousView,
        previousHost,
      }
    );

  if (!committed) {
    removeNode(
      nextHost
    );

    return {
      ok: false,
      forbidden: true,

      reason:
        "commit-failed",

      renderSeq:
        seq,
    };
  }

  clearRouteStylesForFallback(
    "forbidden"
  );

  return {
    ok: true,

    forbidden: true,

    reason,

    canonicalPath:
      state.canonicalPath,

    publicPath:
      state.publicPath,

    routeParams:
      state.routeParams,

    renderSeq:
      seq,
  };
}

/* =========================================================
   EXECUTION
========================================================= */

async function redirectTo(
  path = HOME_PATH,
  options = {},
  reason =
    "redirect"
) {
  const depth =
    Number(
      options
        .__redirectDepth ||
      0
    );

  if (
    depth >= 5
  ) {
    return {
      ok: false,
      skipped: true,
      reason:
        "redirect-loop",

      redirectTo:
        redact(path),
    };
  }

  return executeRender(
    path,
    {
      ...options,

      replaceState:
        true,

      skipHistory:
        false,

      source:
        reason,

      __redirectDepth:
        depth + 1,
    }
  );
}

async function executeRender(
  path = HOME_PATH,
  options = {}
) {
  /*
    Una nueva transición invalida la anterior antes de hacer trabajo.
  */
  abortActiveTransition();

  const seq =
    ++renderSeq;

  const transition =
    createTransition(
      seq,
      options.signal ||
      null
    );

  const initialResolveStartedAt =
    performanceNow();

  const match =
    getRouteMatch(
      path
    );

  setTransitionPerformanceView(
    transition,
    match.route
  );

  recordTransitionPhase(
    transition,
    match.route,
    "resolve",
    initialResolveStartedAt
  );

  setRoutePending(
    match,
    options,
    seq
  );

  try {
    if (
      hasSensitiveQuery(
        match.publicPath
      ) &&
      !routeAllowsSensitiveQuery(
        match.route
      )
    ) {
      const cleanPath =
        stripSensitiveQuery(
          match.publicPath
        );

      if (
        cleanPath !==
        match.publicPath
      ) {
        return redirectTo(
          cleanPath,
          options,
          "scrub-sensitive-query"
        );
      }
    }

    if (
      match.blocked
    ) {
      return isAuthenticated()
        ? renderNotFound(
            match,
            options,
            seq,
            transition
          )
        : redirectTo(
            LOGIN_PATH,
            options,
            "blocked-login"
          );
    }

    const authWaitStartedAt =
      performanceNow();

    const waitedForAuth =
      await waitForAuthIfNeeded(
        match.route
      );

    if (waitedForAuth) {
      recordTransitionPhase(
        transition,
        match.route,
        "auth-wait",
        authWaitStartedAt
      );
    }

    if (
      !transitionIsCurrent(
        transition
      )
    ) {
      return {
        ok: false,
        skipped: true,
        reason:
          transition.signal
            ?.aborted
            ? "aborted"
            : "stale",
      };
    }

    if (
      !match.route
    ) {
      return isAuthenticated()
        ? renderNotFound(
            match,
            options,
            seq,
            transition
          )
        : redirectTo(
            LOGIN_PATH,
            options,
            "not-found-login"
          );
    }

    const guardStartedAt =
      performanceNow();

    const access =
      checkAccess(
        match
      );

    if (
      !access.allowed
    ) {
      recordTransitionPhase(
        transition,
        match.route,
        "guard",
        guardStartedAt
      );

      if (
        access.redirectTo
      ) {
        return redirectTo(
          access.redirectTo,
          options,
          access.reason ||
          "guard-redirect"
        );
      }

      return renderForbidden(
        match,
        access.reason ||
        "forbidden",
        options,
        seq,
        transition
      );
    }

    const slugRedirect =
      options
        .keepCanonicalHome ===
        true
        ? ""
        : privateSlugRedirect(
            match
          );

    recordTransitionPhase(
      transition,
      match.route,
      "guard",
      guardStartedAt
    );

    if (
      slugRedirect
    ) {
      return redirectTo(
        slugRedirect,
        options,
        "user-scope"
      );
    }

    const privateRuntimeStartedAt = performanceNow();
    const privateRuntimeReady = await syncPrivateRuntimeForRoute(
      match.route,
      options
    );

    if (
      match.route?.public !== true &&
      privateRuntimeReady !== true
    ) {
      return {
        ok: false,
        reason: "private-runtime-unavailable",
        canonicalPath: match.canonicalPath,
        publicPath: stateSafePublicPath(match),
      };
    }

    recordTransitionPhase(
      transition,
      match.route,
      "private-runtime",
      privateRuntimeStartedAt
    );

    if (!transitionIsCurrent(transition)) {
      return {
        ok: false,
        skipped: true,
        reason: "stale-private-runtime",
      };
    }

    return await renderRoute(
      match,
      options,
      seq,
      transition
    );
  } finally {
    /*
      Sólo la transición propietaria puede limpiar su pending.
      Si ya existe otra, clearRoutePending() rechaza por seq.
    */
    clearRoutePending(
      seq
    );

    transition.cleanup();

    if (
      activeTransition ===
      transition
    ) {
      activeTransition =
        null;
    }
  }
}

function render(
  path = HOME_PATH,
  options = {}
) {
  const task =
    executeRender(
      path,
      isObject(options)
        ? options
        : {}
    );

  renderTask =
    task;

  task
    .catch(
      () => null
    )
    .finally(
      () => {
        if (
          renderTask ===
          task
        ) {
          renderTask =
            null;
        }
      }
    );

  return task;
}

function renderCurrent(
  options = {}
) {
  return render(
    browserPath(),
    {
      ...options,

      replaceState:
        true,

      skipHistory:
        options.skipHistory ??
        false,

      source:
        options.source ||
        "render-current",
    }
  );
}

/* =========================================================
   NAVIGATION
========================================================= */

function hrefAllowed(
  href = ""
) {
  if (
    isUnsafeHref(
      href
    )
  ) {
    return false;
  }

  if (
    isExternalHref(
      href
    )
  ) {
    return false;
  }

  if (
    isHashOnlyHref(
      href
    )
  ) {
    return false;
  }

  if (
    isBlockedPath(
      href
    )
  ) {
    return false;
  }

  if (
    hasSensitiveQuery(
      href
    ) &&
    !routeIsTokenRoute(
      href
    )
  ) {
    return false;
  }

  return true;
}

function shouldSkipSameNavigation(
  target = HOME_PATH,
  options = {}
) {
  if (
    options.force ===
      true ||
    options.reload ===
      true ||
    options.forceRefresh ===
      true
  ) {
    return false;
  }

  const normalizedTarget =
    normalizePublicPath(
      target
    );

  /*
    Si otra ruta está pendiente, navegar a la URL visible actual
    debe cancelar esa transición en vez de ignorar el click.
  */
  if (
    renderTask &&
    pendingPath &&
    pendingPath !==
      normalizedTarget
  ) {
    return false;
  }

  return (
    normalizedTarget ===
    currentPublicPath()
  );
}

function navigate(
  path = HOME_PATH,
  options = {}
) {
  const href =
    cleanText(
      path,
      HOME_PATH
    );

  if (
    !hrefAllowed(
      href
    )
  ) {
    return Promise.resolve({
      ok: true,
      skipped: true,
      reason:
        "ignored-href",
    });
  }

  const target =
    normalizeNavigationTarget(
      href,
      options
    );

  const normalizedTarget =
    normalizePublicPath(
      target
    );

  /*
    Doble click / doble navigate al mismo destino pendiente:
    compartimos la misma Promise, no lanzamos otra transición.
  */
  if (
    renderTask &&
    pendingPath &&
    pendingPath ===
      normalizedTarget
  ) {
    return renderTask;
  }

  if (
    shouldSkipSameNavigation(
      normalizedTarget,
      options
    )
  ) {
    const match =
      getRouteMatch(
        normalizedTarget
      );

    const safePath =
      stateSafePublicPath(
        match
      );

    setActiveMenu(
      match.route,
      {
        publicPath:
          safePath,

        canonicalPath:
          match.canonicalPath,

        pending:
          false,
      }
    );

    return Promise.resolve({
      ok: true,
      skipped: true,
      reason:
        "same-route",

      publicPath:
        safePath,

      canonicalPath:
        match.canonicalPath,
    });
  }

  return render(
    normalizedTarget,
    options
  );
}

function replace(
  path = HOME_PATH,
  options = {}
) {
  return navigate(
    path,
    {
      ...options,

      replaceState:
        true,
    }
  );
}

function goAfterLogin(
  fallback = HOME_PATH,
  options = {}
) {
  /* Login cambia autorización sin recargar: Core debe estar sincronizado. */
  authCall("syncAuthState", false);

  return replace(
    normalizePostLoginTarget(
      fallback
    ),
    {
      ...options,
      force: true,
      source: "login",
    }
  );
}

/* =========================================================
   EVENTS
========================================================= */

function linkHref(
  element = null
) {
  return cleanText(
    element?.dataset?.route ||
    element?.dataset?.href ||
    element?.dataset?.to ||
    element?.getAttribute?.(
      "data-route"
    ) ||
    element?.getAttribute?.(
      "data-href"
    ) ||
    element?.getAttribute?.(
      "data-to"
    ) ||
    element?.getAttribute?.(
      "href"
    ),
    ""
  );
}

function onClick(
  event
) {
  if (
    event.defaultPrevented ||
    event[
      ROUTER_EVENT_HANDLED_KEY
    ] === true ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const target =
    event.target
      ?.nodeType ===
      3
      ? event.target
          .parentElement
      : event.target;

  const element =
    target?.closest?.(
      "a[data-spa], a[data-route], a[href^='/'], [data-router-link]"
    );

  if (
    !element ||
    element
      .hasAttribute?.(
        "download"
      )
  ) {
    return;
  }

  const href =
    linkHref(
      element
    );

  const targetAttr =
    cleanText(
      element
        .getAttribute?.(
          "target"
        ),
      ""
    ).toLowerCase();

  if (
    !href ||
    (
      targetAttr &&
      targetAttr !==
        "_self"
    )
  ) {
    return;
  }

  if (
    !hrefAllowed(
      href
    )
  ) {
    return;
  }

  event.preventDefault();

  event[
    ROUTER_EVENT_HANDLED_KEY
  ] =
    true;

  navigate(
    href,
    {
      source:
        "link-click",
    }
  );
}

function onPopState() {
  render(
    browserPath(),
    {
      skipHistory:
        true,

      replaceState:
        true,

      source:
        "popstate",
    }
  );
}

function onDom(
  target,
  eventName,
  handler,
  options = false
) {
  if (
    !target ||
    !isFunction(
      target.addEventListener
    )
  ) {
    return (
      () => false
    );
  }

  target.addEventListener(
    eventName,
    handler,
    options
  );

  return () => {
    try {
      target.removeEventListener(
        eventName,
        handler,
        options
      );

      return true;
    } catch {
      return false;
    }
  };
}

/* =========================================================
   LIFECYCLE
========================================================= */

function attachToCore() {
  try {
    /*
      Registro único.
      AppCore.Router / AppCore.router ya son aliases del registry.
    */
    if (
      isFunction(
        AppCore?.registerModule
      )
    ) {
      AppCore.registerModule(
        "router",
        Router,
        {
          overwrite:
            true,
        }
      );
    } else {
      AppCore.Router =
        Router;
    }
  } catch {
    // noop
  }

  return true;
}

function init() {
  if (initialized) {
    return Router;
  }

  initialized =
    true;

  ensureInitialHistoryState();
  attachToCore();

  return Router;
}

function bind() {
  if (bound) {
    return Router;
  }

  init();

  if (
    isBrowser()
  ) {
    disposers.push(
      onDom(
        document,
        "click",
        onClick,
        true
      )
    );

    disposers.push(
      onDom(
        window,
        "popstate",
        onPopState
      )
    );
  }

  bound =
    true;

  attachToCore();

  return Router;
}

function unbind() {
  /*
    Invalida cualquier render pendiente antes de desmontar.
    Sin esto, una vista lenta podría terminar después de destroy().
  */
  ++renderSeq;

  abortActiveTransition(
    "router-unbind"
  );

  if (
    activeTransition
  ) {
    try {
      activeTransition
        .cleanup?.();
    } catch {
      // noop
    }

    activeTransition =
      null;
  }

  while (
    disposers.length
  ) {
    try {
      disposers.pop()?.();
    } catch {
      // noop
    }
  }

  destroyActiveView();

  /*
    seq=0 fuerza cleanup del estado pending actual.
  */
  clearRoutePending(0);

  bound =
    false;

  renderTask =
    null;

  return Router;
}

function start(
  options = {}
) {
  bind();

  return renderCurrent({
    ...options,

    source:
      options.source ||
      "router.start",
  });
}

/* =========================================================
   SNAPSHOT / DEBUG
========================================================= */

function safeMatchForDebug(
  match = {}
) {
  return {
    route:
      match.route
        ? {
            path:
              match.route.path,

            name:
              match.route.name,

            title:
              match.route.title,

            public:
              match.route.public,

            guestOnly:
              match.route.guestOnly,

            tokenRoute:
              match.route.tokenRoute,

            adminOnly:
              match.route.adminOnly,

            viewKey:
              match.route.viewKey,
          }
        : null,

    publicPath:
      stateSafePublicPath(
        match
      ),

    pathname:
      isLegacyResetTokenPath(
        match.publicPath ||
        match.pathname
      )
        ? match.canonicalPath
        : match.pathname,

    canonicalPath:
      match.canonicalPath,

    lookupPath:
      match.lookupPath,

    routeParams:
      match.routeParams ||
      {},

    blocked:
      match.blocked ===
      true,

    alias:
      match.alias ===
      true,

    sensitive:
      match.sensitive ===
      true,
  };
}

function getSnapshot() {
  return Object.freeze({
    version:
      ROUTER_VERSION,

    initialized,
    bound,
    renderSeq,

    hasActiveView:
      Boolean(
        activeView
      ),

    hasActiveHost:
      Boolean(
        activeHost
      ),

    rendering:
      Boolean(
        renderTask
      ),

    transitionInFlight:
      Boolean(
        activeTransition
      ),

    pending:
      Boolean(
        pendingPath
      ),

    pendingPath:
      redact(
        pendingPath
      ),

    publicPath:
      redact(
        currentPublicPath()
      ),

    canonicalPath:
      redact(
        currentCanonicalPath()
      ),

    authenticated:
      isAuthenticated(),

    role:
      getCurrentRole() ||
      null,

    isAdmin:
      isAdmin(),

    userSlug:
      getCurrentUserSlug() ||
      null,

    defaultHome:
      redact(
        getDefaultHome()
      ),

    routes:
      Object.freeze(
        getRoutes()
          .map(
            (route) => ({
              path:
                route.path,

              name:
                route.name,

              title:
                route.title,

              public:
                route.public,

              guestOnly:
                route.guestOnly,

              tokenRoute:
                route.tokenRoute,

              adminOnly:
                route.adminOnly,

              viewKey:
                route.viewKey,
            })
          )
      ),

    policy:
      Object.freeze({
        sensitivePublicPathInState:
          false,

        sensitivePublicPathInDom:
          false,

        sensitivePublicPathInHistoryState:
          false,

        tokenPassedToViewInMemory:
          true,

        transitionAbort:
          true,

        staleCommitProtection:
          true,

        samePendingNavigationDedup:
          true,

        legacyResetAlias:
          true,

        nativeRoutePhaseTelemetry:
          true,

        opaqueNavigationPerformanceIds:
          true,

        singleRouteResolutionPerTransition:
          true,

        postCommitActiveMenuDedup:
          true,
      }),
  });
}

function debug(
  path = ""
) {
  const target =
    cleanText(
      path,
      ""
    );

  return target
    ? {
        target:
          redact(
            target
          ),

        match:
          safeMatchForDebug(
            getRouteMatch(
              target
            )
          ),

        snapshot:
          getSnapshot(),
      }
    : getSnapshot();
}

/* =========================================================
   API
========================================================= */

export const Router = {
  version:
    ROUTER_VERSION,

  get routes() {
    return getRoutes();
  },

  init,
  bind,
  unbind,

  destroy:
    unbind,

  start,

  boot:
    start,

  renderInitialRoute:
    start,

  getRoute,
  routeExists,
  getRouteMatch,
  getCurrentRoute,

  getCurrentPath:
    currentPublicPath,

  getCurrentPublicPath:
    currentPublicPath,

  getCurrentCanonicalPath:
    currentCanonicalPath,

  navigate,
  replace,

  render,
  renderCurrent,

  goAfterLogin,

  buildPublicPath:
    normalizeNavigationTarget,

  resolveSpaHref:
    normalizeNavigationTarget,

  buildUserHomePath,
  buildUserScopedPath,
  getDefaultHome,

  extractSlugFromPath:
    getUserSlugFromPath,

  isUserHomePath,
  isUserScopedPath,

  isSameCanonicalPath:
    (
      a = HOME_PATH,
      b = HOME_PATH
    ) =>
      canonicalPathFromPublicPath(
        a
      ) ===
      canonicalPathFromPublicPath(
        b
      ),

  safePath:
    normalizePublicPath,

  safePublicPath:
    normalizePublicPath,

  safeCanonicalPath:
    normalizePathname,

  getSnapshot,

  getDebugSnapshot:
    getSnapshot,

  snapshot:
    getSnapshot,

  debug,
};

export default Router;

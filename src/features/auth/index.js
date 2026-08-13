/* =========================================================
   Onion Support - Auth
   Archivo: /src/features/auth/index.js

   Responsabilidad:
   - Auth mínimo de la SPA.
   - Login/logout/restore/refresh/me.
   - Sesión actual delegada en AppCore.
   - HTTP delegado en core/http.js.
   - Home visible autenticada: /@{user.slug}.
   - Restaurar sesión tras refresh del navegador usando cookie httpOnly.
   - Evitar carreras de Auth al cerrar sesión.
   - Evitar escrituras duplicadas entre Auth / Core / HTTP.
   - Sin Router.
   - Sin Toast.
   - Sin Store.
   - Sin Storage.
   - Sin fetch propio.
   - Sin eventos internos.
   - Sin 2FA/MFA/OTP.
   - Sin lógica de vistas.
========================================================= */

import { AppCore } from "../../core/index.js";
import Http from "../../core/http.js";

import {
  AUTH_ENDPOINTS,
  ROUTES,
  USER_HOME_PREFIX,
  ALLOWED_ROLES,
  buildUserHomeRoute,
  normalizeUserSlug,
} from "../../core/config.js";

export const AUTH_VERSION =
  "auth.minimal.v6-hardened";

const ROOT_PATH = "/";

const LEGACY_RESET_TOKEN_PATH =
  /(\/(?:reset-password|password-reset)\/confirm\/)([^/?#\s]+)/gi;

const VALID_ROLES =
  new Set(
    (
      Array.isArray(ALLOWED_ROLES) &&
      ALLOWED_ROLES.length
        ? ALLOWED_ROLES
        : ["admin", "user"]
    ).map(
      (role) =>
        String(role)
          .toLowerCase()
    )
  );

const AUTH_ROUTES =
  Object.freeze({
    login:
      ROUTES.login ||
      "/login",

    passwordRequest:
      ROUTES.passwordRequest ||
      "/password-request",

    passwordReset:
      ROUTES.passwordReset ||
      "/password-reset",

    activateAccount:
      ROUTES.activateAccount ||
      "/activate-account",
  });

const AUTH_HOME =
  Object.freeze({
    canonical:
      ROOT_PATH,

    userPrefix:
      USER_HOME_PREFIX ||
      "/@",
  });

/* =========================================================
   SESSION STATE
========================================================= */

const sessionState = {
  loggingIn: false,
  restoring: false,
  refreshing: false,
  checking: false,

  loginPromise: null,
  restorePromise: null,
  refreshPromise: null,
  mePromise: null,

  generation: 0,
  activeFlows: 0,

  lastLoginAt: null,
  lastRestoreAt: null,
  lastRefreshAt: null,
  lastMeAt: null,
  lastLogoutAt: null,

  lastError: null,
};

const activeFlowControllers =
  new Set();

/* =========================================================
   BASICS
========================================================= */

function isObject(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function isFunction(value) {
  return (
    typeof value === "function"
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

function redact(
  value = ""
) {
  return cleanText(
    value,
    ""
  )
    .replace(
      LEGACY_RESET_TOKEN_PATH,
      "$1***"
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
    );
}

function safeError(
  error = null,
  type = "auth"
) {
  if (!error) {
    return null;
  }

  return {
    type,

    name:
      cleanText(
        error?.name,
        "Error"
      ),

    message:
      redact(
        error?.message ||
        String(error)
      ),

    status:
      error?.status ||
      error?.statusCode ||
      error?.response?.status ||
      null,

    code:
      cleanText(
        error?.code ||
        error?.error ||
        "",
        ""
      ) ||
      null,

    canRefresh:
      isRefreshableAuthError(
        error
      ),

    shouldClearSession:
      shouldClearSessionForAuthError(
        error
      ),
  };
}

function safePayload(
  value,
  depth = 0
) {
  if (
    depth > 5
  ) {
    return null;
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value ===
    "string"
  ) {
    return redact(
      value
    );
  }

  if (
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
      "function" ||
    typeof value ===
      "symbol" ||
    typeof value ===
      "bigint"
  ) {
    return undefined;
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(
        0,
        100
      )
      .map(
        (item) =>
          safePayload(
            item,
            depth + 1
          )
      );
  }

  if (
    !isObject(value)
  ) {
    return null;
  }

  const output = {};

  for (
    const [
      key,
      child,
    ]
    of Object.entries(
      value
    )
  ) {
    if (
      /(token|refresh|password|secret|authorization|jwt|cookie|sessionid|session_id|code|sig|signature)/i.test(
        key
      )
    ) {
      output[key] =
        child
          ? "***"
          : null;

      continue;
    }

    const clean =
      safePayload(
        child,
        depth + 1
      );

    if (
      clean !== undefined
    ) {
      output[key] =
        clean;
    }
  }

  return output;
}

/* =========================================================
   FLOW GENERATION / ABORT
========================================================= */

function currentGeneration() {
  return Number(
    sessionState.generation ||
    0
  );
}

function invalidateFlows() {
  sessionState.generation =
    currentGeneration() + 1;

  return sessionState.generation;
}

function flowIsCurrent(
  generation
) {
  return (
    generation ===
    currentGeneration()
  );
}

function syncActiveFlowCount() {
  sessionState.activeFlows =
    activeFlowControllers.size;
}

function createFlowAbort(
  externalSignal = null
) {
  if (
    typeof AbortController ===
    "undefined"
  ) {
    return {
      signal:
        externalSignal ||
        undefined,

      cleanup:
        () => {},

      abort:
        () => false,
    };
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

  activeFlowControllers.add(
    controller
  );

  syncActiveFlowCount();

  const cleanup =
    () => {
      activeFlowControllers.delete(
        controller
      );

      syncActiveFlowCount();

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
    };

  return {
    signal:
      controller.signal,

    cleanup,

    abort,
  };
}

function abortActiveFlows() {
  for (
    const controller
    of [
      ...activeFlowControllers,
    ]
  ) {
    try {
      if (
        !controller.signal.aborted
      ) {
        controller.abort(
          "auth-session-invalidated"
        );
      }
    } catch {
      try {
        controller.abort();
      } catch {
        // noop
      }
    }
  }

  return true;
}

function withFlowSignal(
  options = {},
  signal = undefined
) {
  return {
    ...options,
    signal,
  };
}

/* =========================================================
   CORE / HTTP
========================================================= */

function coreState(
  options = {}
) {
  try {
    if (
      isFunction(
        AppCore?.getState
      )
    ) {
      return AppCore.getState(
        options
      );
    }
  } catch {
    // fallback abajo
  }

  return isObject(
    AppCore?.state
  )
    ? AppCore.state
    : {};
}

function installHttp() {
  try {
    Http.install?.(
      AppCore
    );
  } catch {
    // noop
  }

  return Http;
}

function isRefreshableAuthError(
  error = null
) {
  try {
    return (
      Http
        .isRefreshableAuthError
        ?.(error) === true
    );
  } catch {
    return false;
  }
}

function shouldClearSessionForAuthError(
  error = null
) {
  try {
    return (
      Http
        .shouldClearSessionForAuthError
        ?.(error) === true
    );
  } catch {
    return false;
  }
}

function isHttpAuthError(
  error = null
) {
  try {
    return (
      Http
        .isAuthError
        ?.(error) === true
    );
  } catch {
    const status =
      Number(
        error?.status ||
        error?.statusCode ||
        0
      );

    return (
      status === 401 ||
      status === 403
    );
  }
}

/* =========================================================
   TOKEN / ROLE / USER
========================================================= */

function stripBearer(
  value = ""
) {
  return cleanText(
    value,
    ""
  ).replace(
    /^Bearer\s+/i,
    ""
  );
}

function tokenOk(
  value = ""
) {
  const token =
    stripBearer(
      value
    );

  if (!token) {
    return false;
  }

  if (
    /\s/.test(
      token
    )
  ) {
    return false;
  }

  if (
    token.length >
    8192
  ) {
    return false;
  }

  return ![
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
    "{}",
    "[]",
  ].includes(
    token.toLowerCase()
  );
}

function cleanToken(
  value = ""
) {
  const token =
    stripBearer(
      value
    );

  return tokenOk(
    token
  )
    ? token
    : "";
}

function normalizeRole(
  value = ""
) {
  if (
    Array.isArray(value)
  ) {
    const roles =
      value
        .map(
          normalizeRole
        )
        .filter(Boolean);

    if (
      roles.includes(
        "admin"
      )
    ) {
      return "admin";
    }

    if (
      roles.includes(
        "user"
      )
    ) {
      return "user";
    }

    return "";
  }

  const role =
    cleanText(
      value,
      ""
    ).toLowerCase();

  return VALID_ROLES.has(
    role
  )
    ? role
    : "";
}

function roleOrUser(
  value = ""
) {
  return (
    normalizeRole(
      value
    ) ||
    "user"
  );
}

function normalizeUser(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return null;
  }

  try {
    if (
      isFunction(
        AppCore?.normalizeUser
      )
    ) {
      const normalized =
        AppCore.normalizeUser(
          user
        );

      if (
        !normalized ||
        normalized.usable ===
          false
      ) {
        return null;
      }

      return normalized;
    }
  } catch {
    // noop
  }

  return null;
}

function publicUser(
  user = null
) {
  const normalized =
    normalizeUser(
      user
    );

  if (!normalized) {
    return null;
  }

  try {
    if (
      isFunction(
        AppCore?.publicUser
      )
    ) {
      return AppCore.publicUser(
        normalized
      );
    }
  } catch {
    // fallback abajo
  }

  return {
    id:
      normalized.id ||
      normalized.userId ||
      null,

    userId:
      normalized.userId ||
      normalized.id ||
      null,

    username:
      normalized.username ||
      null,

    slug:
      normalized.slug ||
      null,

    displayName:
      normalized.displayName ||
      normalized.username ||
      "Usuario",

    role:
      normalized.role ||
      "user",

    rol:
      normalized.role ||
      "user",

    roles:
      Array.isArray(
        normalized.roles
      )
        ? [
            ...normalized.roles,
          ]
        : [
            normalized.role ||
            "user",
          ],

    avatarUrl:
      normalized.avatarUrl ||
      "",
  };
}

function getUserSlugFromUser(
  user = null
) {
  if (
    !isObject(user)
  ) {
    return "";
  }

  return normalizeUserSlug(
    user.slug ||
    user.lookup?.slug ||
    user.profile?.slug ||
    user.routing?.slug ||
    user.username ||
    user.userId ||
    user.id ||
    ""
  );
}

function buildUserHomePath(
  user = null
) {
  const target =
    user === null
      ? getCurrentUser()
      : user;

  const slug =
    isObject(target)
      ? getUserSlugFromUser(
          target
        )
      : normalizeUserSlug(
          target
        );

  try {
    return (
      buildUserHomeRoute(
        slug
      ) ||
      ROOT_PATH
    );
  } catch {
    return slug
      ? `${AUTH_HOME.userPrefix}${slug}`
      : ROOT_PATH;
  }
}

/* =========================================================
   AUTH CONTEXT
========================================================= */

function readAuthContext() {
  const state =
    coreState({
      includeToken: true,
    });

  const token =
    cleanToken(
      first(
        state.token,
        state.accessToken,
        state.access_token,
        Http.getAccessToken?.(),
        ""
      )
    );

  const user =
    normalizeUser(
      first(
        state.user,
        state.currentUser,
        state.session?.user,
        null
      )
    );

  const session =
    isObject(
      state.session
    )
      ? state.session
      : (
          isObject(
            state.sessionData
          )
            ? state.sessionData
            : null
        );

  const role =
    user
      ? roleOrUser(
          first(
            user.role,
            user.rol,
            user.roles,
            ""
          )
        )
      : "";

  const roles =
    token &&
    user &&
    role
      ? [role]
      : [];

  const userSlug =
    user
      ? getUserSlugFromUser(
          user
        )
      : "";

  const homePath =
    user
      ? buildUserHomePath(
          user
        )
      : ROOT_PATH;

  const permissions =
    user &&
    Array.isArray(
      user.permissions ||
      user.permisos
    )
      ? [
          ...(
            user.permissions ||
            user.permisos
          ),
        ]
      : [];

  const hasRefreshToken =
    Boolean(
      state.hasRefreshToken ===
        true ||
      session?.persistent ===
        true ||
      session?.restoreOnBoot ===
        true
    );

  return {
    token,
    user,
    session,

    authenticated:
      Boolean(
        token &&
        user
      ),

    role,
    roles,

    userSlug,
    homePath,
    permissions,

    hasToken:
      Boolean(token),

    hasUser:
      Boolean(user),

    hasSession:
      Boolean(session),

    hasRefreshToken,
  };
}

/* =========================================================
   USER / SESSION READ
========================================================= */

function getToken() {
  return (
    readAuthContext()
      .token
  );
}

function getAccessToken() {
  return getToken();
}

function hasValidToken() {
  return (
    readAuthContext()
      .hasToken
  );
}

function getRefreshToken() {
  /*
    Refresh token HttpOnly:
    nunca se expone a JavaScript.
  */
  return "";
}

function getCurrentUser() {
  return (
    readAuthContext()
      .user
  );
}

function getUser() {
  return getCurrentUser();
}

function getProfile() {
  return getCurrentUser();
}

function getCurrentSession() {
  return (
    readAuthContext()
      .session
  );
}

function getSession() {
  return getCurrentSession();
}

function getUserSlug() {
  return (
    readAuthContext()
      .userSlug
  );
}

function buildUserHomePathFromSlug(
  slug = ""
) {
  return buildUserHomePath(
    slug
  );
}

function getDefaultHome() {
  return (
    readAuthContext()
      .homePath
  );
}

function getPostLoginTarget() {
  const context =
    readAuthContext();

  return context.authenticated
    ? context.homePath
    : ROOT_PATH;
}

function getRole() {
  return (
    readAuthContext()
      .role
  );
}

function getRoles() {
  return (
    readAuthContext()
      .roles
  );
}

function isAuthenticated() {
  return (
    readAuthContext()
      .authenticated
  );
}

function isAdmin() {
  const context =
    readAuthContext();

  return Boolean(
    context.authenticated &&
    context.role === "admin"
  );
}

function hasRole(
  role = ""
) {
  const required =
    normalizeRole(
      role
    );

  const context =
    readAuthContext();

  if (
    !required ||
    !context.authenticated
  ) {
    return false;
  }

  if (
    context.role ===
    "admin"
  ) {
    return true;
  }

  return context.roles.includes(
    required
  );
}

function requireRole(
  role = ""
) {
  if (
    hasRole(role)
  ) {
    return true;
  }

  const error =
    new Error(
      "No tienes permisos para acceder a este recurso."
    );

  error.code =
    "AUTH_FORBIDDEN";

  error.status =
    403;

  throw error;
}

function getPermissions() {
  return (
    readAuthContext()
      .permissions
  );
}

function getAuthHeader() {
  const token =
    getToken();

  return token
    ? {
        Authorization:
          `Bearer ${token}`,
      }
    : {};
}

function hasRefreshToken() {
  return (
    readAuthContext()
      .hasRefreshToken
  );
}

/* =========================================================
   PAYLOAD
========================================================= */

function payloadSources(
  payload = {}
) {
  if (
    !isObject(payload)
  ) {
    return [];
  }

  return [
    payload,

    isObject(payload.data)
      ? payload.data
      : null,

    isObject(payload.payload)
      ? payload.payload
      : null,

    isObject(payload.result)
      ? payload.result
      : null,

    isObject(payload.auth)
      ? payload.auth
      : null,

    isObject(payload.session)
      ? payload.session
      : null,

    isObject(payload.sessionData)
      ? payload.sessionData
      : null,
  ].filter(Boolean);
}

function looksLikeUser(
  value = null
) {
  if (
    !isObject(value)
  ) {
    return false;
  }

  return Boolean(
    value.id ||
    value.userId ||
    value.username ||
    value.slug ||
    value.lookup?.slug ||
    value.profile?.slug ||
    value.role ||
    value.rol ||
    Array.isArray(
      value.roles
    )
  );
}

function pick(
  payload = {},
  names = []
) {
  for (
    const source
    of payloadSources(
      payload
    )
  ) {
    for (
      const name
      of names
    ) {
      const value =
        source?.[name];

      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        return value;
      }
    }
  }

  return null;
}

function extractToken(
  payload = {}
) {
  return cleanToken(
    pick(
      payload,
      [
        "token",
        "accessToken",
        "access_token",
      ]
    ) ||
    ""
  );
}

function extractUser(
  payload = {}
) {
  if (
    looksLikeUser(
      payload
    )
  ) {
    return payload;
  }

  const user =
    pick(
      payload,
      [
        "user",
        "currentUser",
        "usuario",
        "me",
        "account",
        "profile",
      ]
    );

  return looksLikeUser(
    user
  )
    ? user
    : null;
}

function extractSession(
  payload = {}
) {
  const session =
    pick(
      payload,
      [
        "session",
        "sessionData",
        "currentSession",
      ]
    );

  return isObject(
    session
  )
    ? session
    : null;
}

function normalizeAuthPayload(
  payload = {},
  options = {}
) {
  const source =
    isObject(payload)
      ? payload
      : {};

  const current =
    options.allowCurrentToken ===
      true ||
    options.allowCurrentUser ===
      true
      ? readAuthContext()
      : null;

  const token =
    extractToken(
      source
    ) ||
    (
      options.allowCurrentToken ===
        true
        ? current?.token ||
          ""
        : ""
    );

  const user =
    normalizeUser(
      extractUser(
        source
      ) ||
      (
        options.allowCurrentUser ===
          true
          ? current?.user ||
            null
          : null
      )
    );

  const session =
    extractSession(
      source
    );

  const role =
    user
      ? roleOrUser(
          first(
            user.role,
            user.rol,
            user.roles,
            ""
          )
        )
      : "";

  const homePath =
    user
      ? buildUserHomePath(
          user
        )
      : ROOT_PATH;

  return {
    token,
    accessToken:
      token,
    access_token:
      token,

    user,
    currentUser:
      user,

    session,
    sessionData:
      session,

    authenticated:
      Boolean(
        token &&
        user
      ),

    hasToken:
      Boolean(token),

    hasUser:
      Boolean(user),

    hasSession:
      Boolean(session),

    hasRefreshToken:
      source.hasRefreshToken ===
      true,

    role:
      role ||
      null,

    rol:
      role ||
      null,

    roles:
      role
        ? [role]
        : [],

    userSlug:
      user
        ? getUserSlugFromUser(
            user
          ) ||
          null
        : null,

    homePath,

    defaultHome:
      homePath,

    postLoginTarget:
      token &&
      user
        ? homePath
        : null,
  };
}

/* =========================================================
   CORE STATE WRITE
========================================================= */

function writeCoreState(
  patch = {}
) {
  try {
    if (
      isFunction(
        AppCore?.setState
      )
    ) {
      AppCore.setState(
        patch,
        {
          source: "auth",
        }
      );

      return true;
    }
  } catch {
    // fallback abajo
  }

  return false;
}

function applySession(
  payload = {},
  options = {}
) {
  const normalized =
    normalizeAuthPayload(
      payload,
      options
    );

  const hasAuthData =
    Boolean(
      normalized.token ||
      normalized.user ||
      normalized.session ||
      normalized.hasRefreshToken
    );

  if (hasAuthData) {
    try {
      if (
        isFunction(
          AppCore?.applySession
        )
      ) {
        AppCore.applySession(
          normalized
        );
      } else {
        writeCoreState(
          normalized
        );
      }
    } catch {
      writeCoreState(
        normalized
      );
    }
  }

  return getPublicAuthResult();
}

function clearSession(
  options = {}
) {
  if (
    options.invalidate !==
    false
  ) {
    invalidateFlows();
    abortActiveFlows();
  }

  let clearedByCore =
    false;

  try {
    if (
      isFunction(
        AppCore?.clearSession
      )
    ) {
      AppCore.clearSession();
      clearedByCore =
        true;
    }
  } catch {
    clearedByCore =
      false;
  }

  if (!clearedByCore) {
    writeCoreState({
      token: null,
      accessToken: null,
      access_token: null,

      user: null,
      currentUser: null,
      session: null,
      sessionData: null,

      authenticated: false,
      hasToken: false,
      hasUser: false,
      hasSession: false,
      hasRefreshToken: false,

      role: null,
      rol: null,
      roles: [],

      userSlug: null,
      homePath: ROOT_PATH,
      defaultHome: ROOT_PATH,
      postLoginTarget: null,
    });

    try {
      Http
        .clearAuthTokens
        ?.();
    } catch {
      // noop
    }
  }

  return true;
}

function syncAuthState() {
  const context =
    readAuthContext();

  if (
    !context.token ||
    !context.user
  ) {
    return false;
  }

  try {
    if (
      isFunction(
        AppCore?.applySession
      )
    ) {
      AppCore.applySession({
        token:
          context.token,

        user:
          context.user,

        session:
          context.session,

        hasRefreshToken:
          context.hasRefreshToken,
      });

      return true;
    }
  } catch {
    // noop
  }

  return false;
}

/* =========================================================
   RESULT / SNAPSHOT
========================================================= */

function getPublicAuthResult(
  payload = {}
) {
  const context =
    readAuthContext();

  return {
    ok:
      payload.ok !== false,

    authenticated:
      context.authenticated,

    skippedRefresh:
      payload.skippedRefresh ===
      true,

    reason:
      cleanText(
        payload.reason,
        ""
      ) ||
      null,

    user:
      context.authenticated
        ? publicUser(
            context.user
          )
        : null,

    currentUser:
      context.authenticated
        ? publicUser(
            context.user
          )
        : null,

    session:
      context.authenticated
        ? context.session
        : null,

    sessionData:
      context.authenticated
        ? context.session
        : null,

    hasToken:
      context.hasToken,

    hasUser:
      context.hasUser,

    hasSession:
      context.hasSession,

    hasRefreshToken:
      context.hasRefreshToken,

    userSlug:
      context.user
        ? context.userSlug ||
          null
        : null,

    homePath:
      context.homePath,

    defaultHome:
      context.homePath,

    postLoginTarget:
      context.authenticated
        ? context.homePath
        : null,

    role:
      context.authenticated
        ? context.role ||
          null
        : null,

    roles:
      context.authenticated
        ? [
            ...context.roles,
          ]
        : [],

    token: null,
    accessToken: null,
    access_token: null,
    refreshToken: null,
    refresh_token: null,
  };
}

function getAuthModuleSnapshot() {
  const result =
    getPublicAuthResult();

  return Object.freeze({
    version:
      AUTH_VERSION,

    ...result,

    isAdmin:
      result.authenticated &&
      result.role ===
        "admin",

    routes:
      AUTH_ROUTES,

    home:
      AUTH_HOME,

    endpoints:
      Object.freeze({
        login:
          AUTH_ENDPOINTS.login,

        me:
          AUTH_ENDPOINTS.me,

        refresh:
          AUTH_ENDPOINTS.refresh,

        logout:
          AUTH_ENDPOINTS.logout,
      }),

    session:
      Object.freeze({
        loggingIn:
          sessionState.loggingIn,

        restoring:
          sessionState.restoring,

        refreshing:
          sessionState.refreshing,

        checking:
          sessionState.checking,

        activeFlows:
          sessionState.activeFlows,

        generation:
          sessionState.generation,

        lastLoginAt:
          sessionState.lastLoginAt,

        lastRestoreAt:
          sessionState.lastRestoreAt,

        lastRefreshAt:
          sessionState.lastRefreshAt,

        lastMeAt:
          sessionState.lastMeAt,

        lastLogoutAt:
          sessionState.lastLogoutAt,

        lastError:
          sessionState.lastError,
      }),
  });
}

/* =========================================================
   RESTORE POLICY
========================================================= */

function shouldAttemptRefresh(
  options = {}
) {
  if (
    options.skipRefresh ===
      true ||
    options.noRefresh ===
      true
  ) {
    return false;
  }

  if (
    options.forceRefresh ===
      true ||
    options.forceRestore ===
      true
  ) {
    return true;
  }

  if (
    options.restoreOnBoot ===
      true ||
    options.persistent ===
      true ||
    options.silent ===
      true
  ) {
    return true;
  }

  if (
    cleanText(
      options.credentials,
      ""
    ).toLowerCase() ===
      "include"
  ) {
    return true;
  }

  return hasValidToken();
}

/* =========================================================
   FLOWS
========================================================= */

function cleanLoginCredentials(
  credentials = {}
) {
  const output =
    isObject(
      credentials
    )
      ? {
          ...credentials,
        }
      : {};

  delete output.remember;
  delete output.rememberMe;
  delete output.remember_me;
  delete output.persist;
  delete output.persistent;

  return output;
}

async function login(
  credentials = {},
  options = {}
) {
  if (
    sessionState.loginPromise
  ) {
    return sessionState.loginPromise;
  }

  const generation =
    currentGeneration();

  sessionState.loggingIn =
    true;

  const flow =
    createFlowAbort(
      options.signal ||
      null
    );

  sessionState.loginPromise =
    (async () => {
      try {
        const raw =
          await Http.login(
            cleanLoginCredentials(
              credentials
            ),
            withFlowSignal(
              options,
              flow.signal
            )
          );

        if (
          !flowIsCurrent(
            generation
          )
        ) {
          return getPublicAuthResult({
            ok: false,
            reason:
              "stale-login",
          });
        }

        let result =
          applySession(
            raw ||
            {},
            {
              allowCurrentToken:
                false,

              allowCurrentUser:
                false,
            }
          );

        /*
          Si login devuelve token pero no usuario,
          /me completa la sesión.
          No intentamos refresh de un token recién emitido.
        */
        if (
          !result.authenticated &&
          result.hasToken
        ) {
          try {
            result =
              await fetchMe({
                ...options,

                noAutoRefresh:
                  true,

                source:
                  "Auth.login.me",
              });
          } catch (error) {
            if (
              isHttpAuthError(
                error
              )
            ) {
              clearSession();
            }

            throw error;
          }
        }

        sessionState.lastError =
          null;

        sessionState.lastLoginAt =
          Date.now();

        return getPublicAuthResult({
          ok:
            result.ok !==
            false,
        });
      } catch (error) {
        sessionState.lastError =
          safeError(
            error,
            "login"
          );

        throw error;
      } finally {
        sessionState.loggingIn =
          false;

        sessionState.loginPromise =
          null;

        flow.cleanup();
      }
    })();

  return sessionState.loginPromise;
}

async function fetchMe(
  options = {}
) {
  if (
    sessionState.mePromise
  ) {
    return sessionState.mePromise;
  }

  const generation =
    currentGeneration();

  sessionState.checking =
    true;

  const flow =
    createFlowAbort(
      options.signal ||
      null
    );

  sessionState.mePromise =
    (async () => {
      try {
        const raw =
          await Http.me(
            withFlowSignal(
              options,
              flow.signal
            )
          );

        if (
          !flowIsCurrent(
            generation
          )
        ) {
          return getPublicAuthResult({
            ok: false,
            reason:
              "stale-me",
          });
        }

        const result =
          applySession(
            raw ||
            {},
            {
              allowCurrentToken:
                true,

              allowCurrentUser:
                false,
            }
          );

        sessionState.lastError =
          null;

        sessionState.lastMeAt =
          Date.now();

        return result;
      } catch (error) {
        sessionState.lastError =
          safeError(
            error,
            "me"
          );

        if (
          flowIsCurrent(
            generation
          ) &&
          shouldClearSessionForAuthError(
            error
          )
        ) {
          clearSession();
        }

        throw error;
      } finally {
        sessionState.checking =
          false;

        sessionState.mePromise =
          null;

        flow.cleanup();
      }
    })();

  return sessionState.mePromise;
}

async function refreshSession(
  options = {}
) {
  if (
    sessionState.refreshPromise
  ) {
    return sessionState.refreshPromise;
  }

  const generation =
    currentGeneration();

  sessionState.refreshing =
    true;

  const flow =
    createFlowAbort(
      options.signal ||
      null
    );

  sessionState.refreshPromise =
    (async () => {
      try {
        /*
          core/http.js ya aplica el payload de refresh al Core.
          Auth NO lo vuelve a escribir.
        */
        await Http.refreshSession(
          isObject(
            options.body
          )
            ? options.body
            : {},
          withFlowSignal(
            options,
            flow.signal
          )
        );

        if (
          !flowIsCurrent(
            generation
          )
        ) {
          return getPublicAuthResult({
            ok: false,
            reason:
              "stale-refresh",
          });
        }

        let result =
          getPublicAuthResult();

        /*
          Refresh puede devolver sólo access token.
          Si falta usuario, /me completa la sesión.
          Evitamos un segundo auto-refresh: acabamos de refrescar.
        */
        if (
          !result.authenticated &&
          result.hasToken
        ) {
          try {
            result =
              await fetchMe({
                ...options,

                noAutoRefresh:
                  true,

                source:
                  "Auth.refreshSession.me",
              });
          } catch (error) {
            if (
              isHttpAuthError(
                error
              )
            ) {
              clearSession();
            }

            throw error;
          }
        }

        sessionState.lastError =
          null;

        sessionState.lastRefreshAt =
          Date.now();

        return result;
      } catch (error) {
        sessionState.lastError =
          safeError(
            error,
            "refresh"
          );

        if (
          flowIsCurrent(
            generation
          ) &&
          shouldClearSessionForAuthError(
            error
          )
        ) {
          clearSession();
        }

        throw error;
      } finally {
        sessionState.refreshing =
          false;

        sessionState.refreshPromise =
          null;

        flow.cleanup();
      }
    })();

  return sessionState.refreshPromise;
}

async function restoreSession(
  options = {}
) {
  if (
    sessionState.restorePromise
  ) {
    return sessionState.restorePromise;
  }

  const generation =
    currentGeneration();

  sessionState.restoring =
    true;

  sessionState.restorePromise =
    (async () => {
      try {
        if (
          isAuthenticated()
        ) {
          sessionState.lastError =
            null;

          return getPublicAuthResult();
        }

        /*
          Si existe access token, Auth controla explícitamente:
          /me -> refresh -> /me.
          Desactivamos auto-refresh sólo en esta primera /me para
          no tener dos autoridades decidiendo el mismo restore.
        */
        if (
          hasValidToken()
        ) {
          try {
            return await fetchMe({
              ...options,

              noAutoRefresh:
                true,

              source:
                "Auth.restoreSession.me",
            });
          } catch (error) {
            if (
              !flowIsCurrent(
                generation
              )
            ) {
              return getPublicAuthResult({
                ok: false,
                reason:
                  "stale-restore",
              });
            }

            if (
              !isRefreshableAuthError(
                error
              )
            ) {
              if (
                shouldClearSessionForAuthError(
                  error
                )
              ) {
                clearSession();
              }

              return getPublicAuthResult({
                ok: false,
                reason:
                  "me-failed",
              });
            }
          }
        }

        if (
          !shouldAttemptRefresh(
            options
          )
        ) {
          sessionState.lastError =
            null;

          return getPublicAuthResult({
            ok: false,

            skippedRefresh:
              true,

            reason:
              "refresh-not-requested",
          });
        }

        try {
          const result =
            await refreshSession({
              ...options,

              source:
                "Auth.restoreSession.refresh",
            });

          if (
            !flowIsCurrent(
              generation
            )
          ) {
            return getPublicAuthResult({
              ok: false,
              reason:
                "stale-restore",
            });
          }

          sessionState.lastError =
            null;

          return result;
        } catch (error) {
          if (
            !flowIsCurrent(
              generation
            )
          ) {
            return getPublicAuthResult({
              ok: false,
              reason:
                "stale-restore",
            });
          }

          sessionState.lastError =
            safeError(
              error,
              "restore"
            );

          if (
            shouldClearSessionForAuthError(
              error
            )
          ) {
            clearSession();
          }

          return getPublicAuthResult({
            ok: false,
            reason:
              "refresh-failed",
          });
        }
      } finally {
        sessionState.restoring =
          false;

        sessionState.restorePromise =
          null;

        sessionState.lastRestoreAt =
          Date.now();
      }
    })();

  return sessionState.restorePromise;
}

async function logout(
  options = {}
) {
  /*
    Invalida y aborta login/me/refresh antes de esperar red.

    Http.logout() se invoca antes de limpiar Core para que la request
    capture el Authorization actual en su construcción síncrona.
  */
  invalidateFlows();
  abortActiveFlows();

  let remoteLogout =
    null;

  try {
    remoteLogout =
      Http.logout(
        options
      );
  } catch {
    remoteLogout =
      null;
  }

  clearSession({
    invalidate: false,
  });

  if (
    remoteLogout
  ) {
    try {
      await remoteLogout;
    } catch {
      // logout remoto best-effort
    }
  }

  sessionState.lastError =
    null;

  sessionState.lastLogoutAt =
    Date.now();

  return true;
}

/* =========================================================
   PUBLIC FLOWS
========================================================= */

function tokenFromPayload(
  payload = {}
) {
  if (
    typeof payload ===
    "string"
  ) {
    return cleanText(
      payload,
      ""
    );
  }

  if (
    !isObject(payload)
  ) {
    return "";
  }

  return cleanText(
    payload.token ||
    payload.resetToken ||
    payload.activationToken ||
    payload.activation_token ||
    payload.reset_token ||
    "",
    ""
  );
}

function validateActivationToken(
  payload = {}
) {
  const token =
    tokenFromPayload(
      payload
    );

  return Promise.resolve({
    ok:
      Boolean(token),

    valid:
      Boolean(token),
  });
}

function validateResetPasswordToken(
  payload = {}
) {
  const token =
    tokenFromPayload(
      payload
    );

  return Promise.resolve({
    ok:
      Boolean(token),

    valid:
      Boolean(token),
  });
}

async function activateAccount(
  payload = {},
  options = {}
) {
  return Http.activateAccount(
    payload,
    options
  );
}

async function requestPasswordReset(
  payload = {},
  options = {}
) {
  return Http.requestPasswordReset(
    payload,
    options
  );
}

async function confirmResetPassword(
  payload = {},
  options = {}
) {
  const raw =
    await Http.confirmPasswordReset(
      payload,
      options
    );

  /*
    Reset correcto NO implica sesión autenticada.
    Sólo aplicamos sesión si el backend devolviera explícitamente
    token + usuario válidos.
  */
  const normalized =
    normalizeAuthPayload(
      raw ||
      {},
      {
        allowCurrentToken:
          false,

        allowCurrentUser:
          false,
      }
    );

  if (
    normalized.authenticated
  ) {
    return applySession(
      normalized,
      {
        allowCurrentToken:
          false,

        allowCurrentUser:
          false,
      }
    );
  }

  return safePayload(
    raw
  );
}

/* =========================================================
   INIT
========================================================= */

function init() {
  installHttp();

  /*
    Un único registro canónico.
    Los aliases AppCore.Auth / AppCore.auth leen del mismo registry.
  */
  try {
    if (
      isFunction(
        AppCore?.registerModule
      )
    ) {
      AppCore.registerModule(
        "auth",
        Auth,
        {
          overwrite: true,
        }
      );
    } else {
      AppCore.Auth =
        Auth;
    }
  } catch {
    // noop
  }

  return Auth;
}

/* =========================================================
   API
========================================================= */

export const Auth = {
  version:
    AUTH_VERSION,

  AUTH_ENDPOINTS,
  AUTH_ROUTES,
  AUTH_HOME,

  session:
    sessionState,

  init,

  login,
  logout,

  restoreSession,
  refreshSession,

  fetchMe,
  me:
    fetchMe,

  getUser,
  getCurrentUser,
  getProfile,

  getSession,
  getCurrentSession,

  getToken,
  getAccessToken,
  getRefreshToken,
  hasValidToken,

  isAuthenticated,

  getRole,
  getRoles,

  getCurrentRole:
    getRole,

  getCurrentRoles:
    getRoles,

  getPermissions,

  isAdmin,

  isCurrentUserAdmin:
    isAdmin,

  hasRole,
  requireRole,

  normalizeUser,
  normalizeAuthPayload,

  getUserSlug,
  buildUserHomePath,
  buildUserHomePathFromSlug,
  getDefaultHome,
  getPostLoginTarget,

  applySession,
  clearSession,
  syncAuthState,

  getAuthHeader,

  activateAccount,
  validateActivationToken,

  requestPasswordReset,
  confirmResetPassword,
  validateResetPasswordToken,

  getAuthModuleSnapshot,

  getSnapshot:
    getAuthModuleSnapshot,

  getDebugSnapshot:
    getAuthModuleSnapshot,

  snapshot:
    getAuthModuleSnapshot,
};

export default Auth;
